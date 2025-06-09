// frontend/src/components/ChatHistorySidebar.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import * as apiClient from '../lib/apiClient';
// You might need icons for actions like delete, rename
// import { Trash2, Edit3, PlusCircle } from 'lucide-react';

// Define the structure of a chat item based on backend schema
interface Chat {
  chat_id: string; // UUID is a string in TS
  chat_name: string;
  // Add other relevant fields if needed, e.g., created_at, updated_at
}

interface ChatHistorySidebarProps {
  currentChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onCreateNewChat: () => void; // Callback to signal App.tsx to handle new chat creation
  // onRenameChat: (chatId: string, newName: string) => void; // Future enhancement
  // onDeleteChat: (chatId: string) => void; // Future enhancement
}

const ChatHistorySidebar: React.FC<ChatHistorySidebarProps> = ({
  currentChatId,
  onSelectChat,
  onCreateNewChat,
}) => {
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchChats = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/chats/'); // Ensure this matches your backend route
      if (!response.ok) {
        if (response.status === 401) {
          // Handle unauthorized access, e.g., redirect to login or show message
          setError('Unauthorized. Please log in.');
          // Potentially call a logout function from AuthContext here
          return;
        }
        throw new Error(`Failed to fetch chats: ${response.statusText}`);
      }
      const data = await response.json();
      setChats(data.chats || []); // Assuming the backend returns { chats: [] }
    } catch (err) {
      console.error('Error fetching chats:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  // Function to handle deleting a chat (you'll need to implement the API call)
  const handleDeleteChat = async (chatId: string) => {
    if (!window.confirm('Are you sure you want to delete this chat?')) {
      return;
    }
    try {
      const response = await fetch(`/api/chats/${chatId}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error('Failed to delete chat');
      }
      // Refresh chat list after deletion
      setChats(prevChats => prevChats.filter(chat => chat.chat_id !== chatId));
      // If the deleted chat was the current one, inform parent to reset
      if (currentChatId === chatId) {
        onSelectChat(''); // Or some indicator for no chat selected
      }
    } catch (err) {
      console.error('Error deleting chat:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete chat.');
    }
  };

  const handleRenameChat = async (chatId: string) => {
    const currentChat = chats.find(c => c.chat_id === chatId);
    const newName = prompt("Enter new chat name:", currentChat?.chat_name || "");

    if (newName && newName.trim() !== "" && newName.trim() !== currentChat?.chat_name) {
      // Optimistically update UI - or wait for API response
      // For simplicity here, we'll update after successful API call.

      try {
        // Ensure apiClient is imported, e.g. import * as apiClient from '../../lib/apiClient';
        const updatedChat = await apiClient.updateChat(chatId, { chat_name: newName.trim() });
        
        setChats(prevChats =>
          prevChats.map(chat =>
            chat.chat_id === chatId ? { ...chat, chat_name: updatedChat.chat_name } : chat
          )
        );
        setError(null); // Clear any previous errors
      } catch (err) {
        console.error('Error renaming chat:', err);
        const errorMsg = err instanceof Error ? err.message : 'Failed to rename chat.';
        setError(`Failed to rename: ${errorMsg}`);
        // Optionally, revert optimistic update here if implemented
        alert(`Error renaming chat: ${errorMsg}`); // Simple feedback
      }
    }
  };

  return (
    <div className="w-64 h-full p-4 border-r border-neutral-700 bg-neutral-800 text-neutral-100 flex flex-col">
      {/* Modified: border-neutral-700, bg-neutral-800, text-neutral-100 */}
      <Button 
        onClick={onCreateNewChat} 
        className="mb-4 w-full bg-blue-600 hover:bg-blue-700 text-white" /* Example button styling, adjust as needed */
      >
        {/* <PlusCircle className="mr-2 h-4 w-4" /> */}
        New Chat
      </Button>
      <h2 className="text-lg font-semibold mb-2">Chat History</h2> {/* Should inherit text-neutral-100 */}
      {isLoading && <p>Loading chats...</p>} {/* Should inherit text-neutral-100 */}
      {error && <p className="text-red-500">{error}</p>} {/* Error text remains red */}
      <ScrollArea className="flex-grow">
        {chats.length === 0 && !isLoading && <p>No chats yet.</p>} {/* Should inherit text-neutral-100 */}
        {chats.map((chat) => (
          <div
            key={chat.chat_id}
            className={`p-2 my-1 rounded-md cursor-pointer hover:bg-neutral-700 ${
    currentChatId === chat.chat_id ? 'bg-neutral-600 font-semibold' : ''
}`}
          >
            <div onClick={() => onSelectChat(chat.chat_id)} className="flex-grow truncate">
              {chat.chat_name} {/* Should inherit text-neutral-100 */}
            </div>
            <div className="flex items-center mt-1">
              <button
                onClick={() => handleRenameChat(chat.chat_id)}
                className="text-xs text-blue-400 hover:underline mr-2" /* Modified: text-blue-400 */
              >
                Rename
              </button>
              <button
                onClick={() => handleDeleteChat(chat.chat_id)}
                className="text-xs text-red-400 hover:underline" /* Modified: text-red-400 */
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </ScrollArea>
    </div>
  );
};

export default ChatHistorySidebar;
