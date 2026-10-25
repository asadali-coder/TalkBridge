import { useEffect, useRef, useState } from "react";
import { useChatStore } from "../store/useChatStore";
import { Image, Send, X, Mic, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import EmojiPicker from "emoji-picker-react";
import { useAuthStore } from "../store/useAuthStore";
import { isUserBanned } from "../lib/sharedMethod";

const MessageInput = () => {
  const [text, setText] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isRequestingMic, setIsRequestingMic] = useState(false);
  const emojiRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStart = useRef(0);
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelled = useRef(false);
  const mounted = useRef(true);
  const streamRef = useRef<MediaStream | null>(null);
  const [voiceDraft, setVoiceDraft] = useState<{
    audio: string;
    audioDuration: number;
  } | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelled.current = true;
      if (recordingTimer.current) clearTimeout(recordingTimer.current);
      if (mediaRecorderRef.current?.state !== "inactive")
        mediaRecorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  const { authUser } = useAuthStore();
  const textInputRef = useRef<HTMLInputElement | null>(null);
  const banned = isUserBanned(authUser);
  const {
    sendMessage,
    replyingTo,
    setReplyingTo,
    isSending,
    isSendingAudio,
    selectedUser,
    onInputTyping,
    shouldFocusInput,
  } = useChatStore();
  useEffect(() => {
    const timer = setTimeout(() => {
      if (window.matchMedia("(min-width: 1024px)").matches)
        textInputRef.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [shouldFocusInput, selectedUser?._id]);
  useEffect(() => {
    if (!banned) return;
    cancelled.current = true;
    if (recordingTimer.current) clearTimeout(recordingTimer.current);
    if (mediaRecorderRef.current?.state === "recording")
      mediaRecorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, [banned]);

  // EMOJI BOX
  useEffect(() => {
    const closeEmoji = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setShowEmoji(false);
      }
    };

    document.addEventListener("mousedown", closeEmoji);
    return () => document.removeEventListener("mousedown", closeEmoji);
  }, []);

  const handleEmojiClick = (emojiData: { emoji: string }) => {
    setText((prev) => prev + emojiData.emoji);
  };

  // IMAGE UPLOAD
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select a valid image");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Maximum image size is 10 MB");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => toast.error("Unable to read image");
    reader.onloadend = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  //  AUDIO RECORD
  const startRecording = async () => {
    if (isRecording || isRequestingMic || banned || isSending || isSendingAudio)
      return;
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      toast.error("Voice recording requires HTTPS and a supported browser.");
      return;
    }
    setIsRequestingMic(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || isUserBanned(useAuthStore.getState().authUser)) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      cancelled.current = false;
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        if (recordingTimer.current) clearTimeout(recordingTimer.current);
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
        if (cancelled.current) return;
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType,
        });
        if (!blob.size) {
          toast.error("No audio recorded. Please try again.");
          return;
        }
        const duration = Math.min(
          120,
          Math.max(0.1, (Date.now() - recordingStart.current) / 1000),
        );
        const reader = new FileReader();
        reader.onload = () => {
          if (!cancelled.current)
            setVoiceDraft({
              audio: reader.result as string,
              audioDuration: duration,
            });
        };
        reader.onerror = () => toast.error("Unable to read recording");
        reader.readAsDataURL(blob);
      };
      recorder.onerror = () => {
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
        toast.error("Recording failed. Please retry.");
      };
      recordingStart.current = Date.now();
      recorder.start();
      setIsRecording(true);
      recordingTimer.current = setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
      }, 120000);
    } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      toast.error("Unable to access microphone. Check permission and HTTPS.");
    } finally {
      if (mounted.current) setIsRequestingMic(false);
    }
  };
  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording")
      mediaRecorderRef.current.stop();
  };

  //SEND MSG
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (banned) {
      toast.error("Your account is temporarily restricted.");
      return;
    }

    if (!text.trim() && !imagePreview && !voiceDraft) return;

    const sent = await sendMessage({
      text: text.trim(),
      image: voiceDraft ? null : imagePreview,
      ...(voiceDraft || {}),
      replyTo: replyingTo?._id,
    });

    if (!sent) return;
    setVoiceDraft(null);
    setText("");
    setImagePreview(null);
    setReplyingTo(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="w-full shrink-0 bg-base-100 border-t border-zinc-700 p-2 sm:p-4">
      {voiceDraft && (
        <div className="flex items-center gap-2 mb-2">
          <audio controls src={voiceDraft.audio} className="h-10 max-w-[70%]" />
          <button type="button" onClick={() => setVoiceDraft(null)}>
            Discard voice
          </button>
        </div>
      )}
      {isRecording && (
        <p role="status" className="text-sm text-red-500 mb-2">
          Recording… tap the microphone to stop (maximum 2 minutes).
        </p>
      )}
      {/* Reply preview */}
      {replyingTo && (
        <div className="mb-2 sm:mb-3 flex items-center justify-between bg-zinc-800 px-3 sm:px-4 py-2 rounded-lg border-l-4 border-blue-500 shadow">
          <div className="flex flex-col text-sm overflow-hidden">
            <span className="text-blue-400 font-medium text-xs">
              Replying to{" "}
              {replyingTo.senderId === authUser._id
                ? "You"
                : selectedUser.fullName}
            </span>

            <span className="text-zinc-300 truncate max-w-[240px] sm:max-w-[380px]">
              {replyingTo.text ||
                (replyingTo.image && "📷 Photo") ||
                (replyingTo.audio && "🎵 Audio")}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            className="ml-2 sm:ml-3 p-2 sm:p-1 rounded-full hover:bg-zinc-700 text-zinc-400 hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Image preview */}
      {imagePreview && (
        <div className="mb-2 sm:mb-3">
          <div className="relative inline-block">
            <img
              src={imagePreview}
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg object-cover border border-zinc-600 shadow"
            />
            <button
              onClick={removeImage}
              type="button"
              className="absolute -top-2 -right-2 bg-zinc-700 text-white w-6 h-6 rounded-full flex items-center justify-center shadow">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Input row */}
      <form onSubmit={handleSendMessage} className="flex items-end gap-2">
        {/* Left actions */}
        <div className="flex items-center gap-1">
          {/* Emoji */}
          {/* <button
            type="button"
            disabled={banned || isRecording}
            onClick={() => setShowEmoji((value) => !value)}
            aria-label="Choose emoji"
            className="btn btn-ghost btn-circle btn-sm sm:btn-md disabled:opacity-50">
            😊
          </button> */}

          {/* Image */}
          <input
            type="file"
            ref={fileInputRef}
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleImageChange}
            className="hidden"
          />
          <button
            type="button"
            disabled={
              banned ||
              isRecording ||
              !!voiceDraft ||
              isSending ||
              isSendingAudio
            }
            aria-label="Attach image"
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-ghost btn-circle btn-sm sm:btn-md disabled:opacity-50">
            <Image size={18} />
          </button>
        </div>

        {/* Text input */}
        <div className="relative flex-1 min-w-0">
          {/* Emoji picker */}
          {showEmoji && (
            <div ref={emojiRef} className="absolute bottom-14 left-0 z-50">
              <EmojiPicker width={280} onEmojiClick={handleEmojiClick} />
            </div>
          )}

          <input
            type="text"
            ref={textInputRef}
            maxLength={5000}
            disabled={banned || isSendingAudio || isSending || isRecording}
            className={[
              "w-full min-w-0 input input-bordered input-md rounded-xl text-base sm:text-sm",
              banned ? "input-disabled cursor-not-allowed" : "",
            ].join(" ")}
            placeholder={
              banned
                ? "Messaging disabled due to policy violations"
                : "Type a message..."
            }
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              onInputTyping();
            }}
          />
        </div>

        {/* Record */}
        <button
          type="button"
          aria-label={isRecording ? "Stop recording" : "Record voice"}
          disabled={
            banned ||
            isRequestingMic ||
            isSendingAudio ||
            isSending ||
            !!voiceDraft ||
            !!imagePreview
          }
          className={`btn btn-circle btn-sm sm:btn-md ${
            banned
              ? "cursor-not-allowed opacity-50"
              : isRecording
                ? "bg-red-500 text-white"
                : "bg-base-200"
          }`}
          onClick={isRecording ? stopRecording : startRecording}>
          {isSendingAudio ? (
            <Loader2 className="animate-spin" size={18} />
          ) : (
            <Mic size={20} />
          )}
        </button>

        {/* Send */}
        <button
          type="submit"
          aria-label="Send message"
          disabled={
            banned ||
            isSending ||
            isSendingAudio ||
            isRecording ||
            (!text.trim() && !imagePreview && !voiceDraft)
          }
          className={[
            "btn btn-circle btn-primary btn-sm sm:btn-md",
            banned ? "btn-disabled" : "",
          ].join(" ")}>
          {isSending ? (
            <Loader2 className="animate-spin" size={18} />
          ) : (
            <Send size={20} />
          )}
        </button>
      </form>
    </div>
  );
};

export default MessageInput;
