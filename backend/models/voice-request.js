import mongoose from "mongoose"

const voiceRequestSchema = new mongoose.Schema(
  {
    originalFilename: {
      type: String,
      required: true,
    },
    storedFilename: {
      type: String,
      required: true,
    },
    prompt: {
      type: String,
      default: "",
    },
    response: {
      type: String,
      required: true,
    },
    audioFilename: {
      type: String,
      default: null,
    },
    mimeType: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true },
)

// Check if the model already exists to prevent model overwrite errors
const VoiceRequest = mongoose.model("VoiceRequest", voiceRequestSchema)

export default VoiceRequest

