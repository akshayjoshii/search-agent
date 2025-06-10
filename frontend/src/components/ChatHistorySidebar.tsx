
import React from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
// import * as apiClient from '../lib/apiClient';

// --- MODIFIED: This interface can be shared or defined in a types file ---
export interface Chat {
  chat_id: string;
  chat_name: string;
}

// --- MODIFIED: The props are updated to receive state from the parent ---
interface ChatHistorySidebarProps {
  chats: Chat[];
  isLoading: boolean;
  error: string | null;
  currentChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onCreateNewChat: () => void;
  onChatDeleted: (deletedChatId: string) => void;
  onRenameChat: (chatId: string, newName: string) => void;
}

const ChatHistorySidebar: React.FC<ChatHistorySidebarProps> = ({
  chats,
  isLoading,
  error,
  currentChatId,
  onSelectChat,
  onCreateNewChat,
  onChatDeleted,
  onRenameChat,
}) => {
  // --- REMOVED: All internal state management (useState, useEffect, fetchChats) is gone. ---

  // --- MODIFIED: These handlers now just call the prop functions from the parent ---
  const handleDeleteChat = async (chatId: string) => {
    if (!window.confirm('Are you sure you want to delete this chat?')) {
      return;
    }
    // The parent component will now handle the API call and state update
    onChatDeleted(chatId);
  };

  const handleRenameChat = async (chatId: string) => {
    const currentChat = chats.find(c => c.chat_id === chatId);
    const newName = prompt("Enter new chat name:", currentChat?.chat_name || "");

    if (newName && newName.trim() !== "" && newName.trim() !== currentChat?.chat_name) {
      // The parent component will handle the API call and state update
      onRenameChat(chatId, newName.trim());
    }
  };


  return (
    <div className="w-64 h-full p-4 border-r border-neutral-700 bg-neutral-800 text-neutral-100 flex flex-col">
      <Button 
        onClick={onCreateNewChat} 
        className="mb-4 w-full bg-blue-600 hover:bg-blue-700 text-white"
      >
        New Chat
      </Button>
      <h2 className="text-lg font-semibold mb-2">Chat History</h2>
      {isLoading && <p>Loading chats...</p>}
      {error && <p className="text-red-500">{error}</p>}
      <ScrollArea className="flex-grow">
        {chats.length === 0 && !isLoading && <p>No chats yet.</p>}
        {/* The rest of the JSX remains the same, rendering from props */}
        {chats.map((chat) => (
          <div
            key={chat.chat_id}
            className={`flex items-center justify-between p-2 my-1 rounded-md hover:bg-neutral-700 ${
              currentChatId === chat.chat_id ? 'bg-neutral-600 font-semibold' : ''
            }`}
          >
            <div 
              onClick={() => onSelectChat(chat.chat_id)} 
              className="flex-grow truncate cursor-pointer"
              title={chat.chat_name}
            >
              {chat.chat_name}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 p-1 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-700"
                >
                  <MoreVertical size={18} />
                  <span className="sr-only">Chat options</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-neutral-800 border-neutral-700 text-neutral-100">
                <DropdownMenuItem 
                  onClick={() => handleRenameChat(chat.chat_id)}
                  className="hover:bg-neutral-700 cursor-pointer"
                >
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleDeleteChat(chat.chat_id)}
                  className="hover:bg-neutral-700 cursor-pointer text-red-400 hover:text-red-300"
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </ScrollArea>
    </div>
  );
};

export default ChatHistorySidebar;