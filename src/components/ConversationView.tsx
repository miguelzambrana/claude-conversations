import type { Message } from '../lib/types.ts';
import MessageBlock from './MessageBlock.tsx';

interface Props {
  messages: Message[];
}

export default function ConversationView({ messages }: Props) {
  if (messages.length === 0) {
    return <p className="text-gray-500 text-sm">No messages in this session.</p>;
  }

  return (
    <div className="space-y-6 py-4">
      {messages.map((msg, i) => (
        <MessageBlock
          key={msg.uuid}
          message={msg}
          nextMessage={messages[i + 1]}
        />
      ))}
    </div>
  );
}
