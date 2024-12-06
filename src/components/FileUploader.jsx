import { useState } from "react";
import { useDropzone } from "react-dropzone";
import axios from "axios";
import JSZip from "jszip";

const BASE_URL = import.meta.env.VITE_BASE_URL;
const API_KEY = import.meta.env.VITE_API_KEY;

const formatTime = (seconds) => {
  const date = new Date(0);
  date.setSeconds(seconds);
  const timeString = date.toISOString().substr(11, 8);
  return `${timeString},000`;
};

const createSRTContent = (text) => {
  const lines = text.split(/\n+/);
  return lines
    .map((line, index) => {
      const startTime = formatTime(index * 2);
      const endTime = formatTime((index + 1) * 2);
      return `${index + 1}\n${startTime} --> ${endTime}\n${line}`;
    })
    .join("\n\n");
};

const uploadFileToAssemblyAI = async (file) => {
  try {
    const audioData = await file.arrayBuffer();
    const uploadResponse = await axios.post(`${BASE_URL}/upload`, audioData, {
      headers: {
        authorization: API_KEY,
        "content-type": "application/octet-stream",
      },
    });
    return uploadResponse.data.upload_url;
  } catch (error) {
    console.error("Error uploading file:", error);
    throw new Error("Failed to upload file.");
  }
};

const transcribeAudio = async (audioUrl) => {
  try {
    const response = await axios.post(
      `${BASE_URL}/transcript`,
      { audio_url: audioUrl },
      { headers: { authorization: API_KEY } }
    );
    return response.data;
  } catch (error) {
    console.error("Error requesting transcription:", error);
    throw new Error("Failed to transcribe audio.");
  }
};

const pollTranscriptionStatus = async (transcriptionId) => {
  const poll = async () => {
    const response = await axios.get(
      `${BASE_URL}/transcript/${transcriptionId}`,
      {
        headers: { authorization: API_KEY },
      }
    );
    if (response.data.status === "completed") {
      return response.data.text;
    } else if (response.data.status === "failed") {
      throw new Error("Transcription failed.");
    } else {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return poll();
    }
  };
  return poll();
};

const FileUploader = () => {
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);

  const onDrop = (acceptedFiles) => {
    setFiles([...files, ...acceptedFiles]);
  };

  const uploadAndTranscribe = async () => {
    if (files.length === 0) {
      alert("No files selected!");
      return;
    }

    setProcessing(true);

    try {
      const zip = new JSZip();
      const uploadPromises = files.map(async (file) => {
        const audioUrl = await uploadFileToAssemblyAI(file);
        const transcription = await transcribeAudio(audioUrl);
        const text = await pollTranscriptionStatus(transcription.id);

        const srtContent = createSRTContent(text);
        zip.file(`${file.name}.srt`, srtContent);
      });

      await Promise.all(uploadPromises);

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "transcripts.zip";
      a.click();
      URL.revokeObjectURL(url);

      alert("All files processed and downloaded.");
    } catch (error) {
      console.error("Error during transcription:", error);
      alert("Failed to process some files.");
    } finally {
      setProcessing(false);
    }
  };

  const { getRootProps, getInputProps } = useDropzone({ onDrop });

  return (
    <div className="uploader">
      <div {...getRootProps({ className: "dropzone" })}>
        <input {...getInputProps()} />
        <p>Drag and drop MP3 files here, or click to select files</p>
      </div>
      <button onClick={uploadAndTranscribe} disabled={processing}>
        {processing ? "Processing..." : "Convert to Text"}
      </button>
    </div>
  );
};

export default FileUploader;
