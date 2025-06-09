// frontend/src/components/ChatHistorySidebar.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
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

  // Placeholder for renaming - for now, just an alert
  const handleRenameChat = (chatId: string) => {
    const newName = prompt("Enter new chat name:");
    if (newName && newName.trim() !== "") {
      // Call API to rename chat
      // For now, just log or alert
      alert(`Rename chat ${chatId} to ${newName}. API call not implemented yet.`);
      // TODO: Implement API call and update state
    }
  };


  return (
    <div className="w-64 h-full p-4 border-r bg-slate-50 flex flex-col">
      <Button onClick={onCreateNewChat} className="mb-4 w-full">
        {/* <PlusCircle className="mr-2 h-4 w-4" /> */}
        New Chat
      </Button>
      <h2 className="text-lg font-semibold mb-2">Chat History</h2>
      {isLoading && <p>Loading chats...</p>}
      {error && <p className="text-red-500">{error}</p>}
      <ScrollArea className="flex-grow">
        {chats.length === 0 && !isLoading && <p>No chats yet.</p>}
        {chats.map((chat) => (
          <div
            key={chat.chat_id}
            className={`p-2 my-1 rounded-md cursor-pointer hover:bg-slate-200 ${
              currentChatId === chat.chat_id ? 'bg-slate-300 font-semibold' : ''
            }`}
          >
            <div onClick={() => onSelectChat(chat.chat_id)} className="flex-grow truncate">
              {chat.chat_name}
            </div>
            <div className="flex items-center mt-1">
              {/* Simple text buttons for now, can be replaced with icons */}
              <button
                onClick={() => handleRenameChat(chat.chat_id)}
                className="text-xs text-blue-500 hover:underline mr-2"
              >
                Rename
              </button>
              <button
                onClick={() => handleDeleteChat(chat.chat_id)}
                className="text-xs text-red-500 hover:underline"
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
