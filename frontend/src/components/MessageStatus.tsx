import { Check, CheckCheck } from "lucide-react";
import type { Message } from "../store/useChatStore";
export default function MessageStatus({ message }: { message: Message }) {
  const label = message.isRead
    ? "Read"
    : message.isDelivered
      ? "Delivered"
      : "Sent";
  const Icon = message.isRead || message.isDelivered ? CheckCheck : Check;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-message-status={message._id}
      className={`inline-flex shrink-0 align-middle ${message.isRead ? "text-sky-400" : "text-zinc-400"}`}
    >
      <Icon size={16} strokeWidth={2} />
    </span>
  );
}
