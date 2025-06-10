import { useStream } from "@langchain/langgraph-sdk/react";
import type { Message } from "@langchain/langgraph-sdk";
import { useState, useEffect, useRef, useCallback } from "react";
import { ProcessedEvent } from "@/components/ActivityTimeline";
import { WelcomeScreen } from "@/components/WelcomeScreen";
import { ChatMessagesView } from "@/components/ChatMessagesView";
import { useAuth } from "./context/AuthContext";
import ChatHistorySidebar, { Chat } from './components/ChatHistorySidebar';
import * as apiClient from './lib/apiClient';

// A simple Login Popup component
const LoginPopup = ({ onLogin, onClose }: { onLogin: () => void; onClose: () => void; }) => (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 transition-opacity duration-300">
        <div className="bg-neutral-700 p-8 rounded-lg shadow-xl text-center transform transition-all scale-100">
            <h2 className="text-xl font-bold mb-4">Login to Continue</h2>
            <p className="mb-6">Please sign in with your Google account to start a new search.</p>
            <div className="flex justify-center gap-4">
                 <button
                    onClick={onClose}
                    className="px-4 py-2 bg-neutral-600 hover:bg-neutral-500 rounded text-white text-md"
                >
                    Cancel
                </button>
                <button
                    onClick={onLogin}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white text-md"
                >
                    Sign in with Google
                </button>
            </div>
        </div>
    </div>
);


export default function App() {
  const { user, isLoading: isAuthLoading, login, logout } = useAuth();
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [displayedMessages, setDisplayedMessages] = useState<Message[]>([]);
  const [currentStreamChatId, setCurrentStreamChatId] = useState<string | null>(null);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  
  const [isLoginModalVisible, setIsLoginModalVisible] = useState(false);
  const [pendingSubmission, setPendingSubmission] = useState<{
    inputValue: string;
    effort: string;
    model: string;
  } | null>(null);

  const [chats, setChats] = useState<Chat[]>([]);
  const [isChatListLoading, setIsChatListLoading] = useState(false);
  const [chatListError, setChatListError] = useState<string | null>(null);

  // --- NEW: Function to fetch the list of chats ---
  const fetchChats = useCallback(async () => {
    if (!user) return; // Don't fetch if not logged in
    setIsChatListLoading(true);
    setChatListError(null);
    try {
      const data = await apiClient.fetchChats(); // Using your apiClient
      // sort chats by last activity if available, otherwise by name or creation date
      setChats(data.chats || []);
    } catch (err) {
      console.error('Error fetching chats in App.tsx:', err);
      setChatListError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsChatListLoading(false);
    }
  }, [user]); // Re-fetch when user logs in

  // --- NEW: Effect to fetch chats when the component mounts or user changes ---
  useEffect(() => {
    fetchChats();
  }, [fetchChats]);


  // --- MODIFIED: This now updates the local state directly ---
  const handleChatDeleted = async (deletedChatId: string) => {
    try {
      await apiClient.deleteChat(deletedChatId);
      setChats(prevChats => prevChats.filter(chat => chat.chat_id !== deletedChatId));
      if (currentChatId === deletedChatId) {
        handleSelectChat(null); // Clears the current chat view
      }
    } catch (err) {
       console.error('Error deleting chat:', err);
       // Optionally show an error to the user
    }
  };
  
  // --- NEW: Handler for renaming a chat ---
  const handleRenameChat = async (chatId: string, newName: string) => {
    try {
      const updatedChat = await apiClient.updateChat(chatId, { chat_name: newName });
      setChats(prevChats =>
        prevChats.map(chat =>
          chat.chat_id === chatId ? { ...chat, chat_name: updatedChat.chat_name } : chat
        )
      );
    } catch (err) {
      console.error('Error renaming chat:', err);
      // Optionally show an error
    }
  };


  const [processedEventsTimeline, setProcessedEventsTimeline] = useState<
    ProcessedEvent[]
  >([]);
  const [historicalActivities, setHistoricalActivities] = useState<
    Record<string, ProcessedEvent[]>
  >({});
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const hasFinalizeEventOccurredRef = useRef(false);

  // ... (useStream hook and other logic remains the same) ...
  const thread = useStream<{
    messages: Message[];
    initial_search_query_count: number;
    max_research_loops: number;
    reasoning_model: string;
    configurable?: { thread_id: string | null };
  }>({
    apiUrl: import.meta.env.DEV
      ? "http://localhost:2024"
      : window.location.origin,
    assistantId: "agent",
    messagesKey: "messages",
    onFinish: (event: any) => {
      console.log('ON_FINISH_EVENT:', JSON.stringify(event, null, 2));

      if (currentChatId === currentStreamChatId && event?.messages) {
        if (event.messages.length > 0 || displayedMessages.length === 0) {
          if (JSON.stringify(event.messages) !== JSON.stringify(displayedMessages)) {
            console.log('onFinish: Syncing displayedMessages with final event.messages:', JSON.stringify(event.messages, null, 2));
            setDisplayedMessages(event.messages);
          }
        } else if (event.messages.length === 0 && displayedMessages.length > 0) {
          console.log('onFinish: Final event.messages is empty, but displayedMessages has content. Not clearing displayedMessages.');
        }
      }

      if (currentChatId === currentStreamChatId && hasFinalizeEventOccurredRef.current) {
        setTimeout(() => {
          const finalMessagesForHistory = event?.messages && event.messages.length > 0
            ? event.messages
            : (thread.messages && thread.messages.length > 0 ? thread.messages : displayedMessages);

          const lastMessage = finalMessagesForHistory.length > 0 ? finalMessagesForHistory[finalMessagesForHistory.length - 1] : null;

          if (lastMessage && lastMessage.type === "ai" && lastMessage.id) {
            console.log('onFinish: Setting historical activities for last AI message ID:', lastMessage.id, 'Timeline events count:', processedEventsTimeline.length);
            setHistoricalActivities((prev) => ({
              ...prev,
              [lastMessage.id!]: [...processedEventsTimeline],
            }));
          } else {
            console.log('onFinish: No valid last AI message found in final messages to set historical activities.');
            if (!lastMessage) console.log('Reason: finalMessagesForHistory was empty or last message was null.');
            else if (lastMessage.type !== "ai") console.log('Reason: Last message was not of type "ai". Type was:', lastMessage.type);
            else if (!lastMessage.id) console.log('Reason: Last AI message had no ID.');
          }
          hasFinalizeEventOccurredRef.current = false;
        }, 0);
      } else {
        if (currentChatId === currentStreamChatId) {
          hasFinalizeEventOccurredRef.current = false;
        }
      }
    },
    onUpdateEvent: (event: any) => {
      console.log('ON_UPDATE_EVENT:', JSON.stringify(event, null, 2));
      if (currentChatId === currentStreamChatId) {
        if (event?.messages) {
          if (event.messages.length > 0 || displayedMessages.length === 0) {
            console.log('onUpdateEvent: Setting displayedMessages with:', JSON.stringify(event.messages, null, 2));
            setDisplayedMessages(event.messages);
          } else {
            console.log('onUpdateEvent: Skipped setDisplayedMessages because event.messages is empty and displayedMessages is not.');
          }
        }
      }

      let processedEvent: ProcessedEvent | null = null;
      try {
        if (event?.messages?.[0]?.content) {
          const content = event.messages[0].content;
          processedEvent = {
            title: "Response",
            data: Array.isArray(content) ? content.join("\n") : String(content),
          };
        } else if (event?.generate_query?.query_list) {
          const queryList = event.generate_query.query_list;
          processedEvent = {
            title: "Generating Search Queries",
            data: Array.isArray(queryList) ? queryList.join(", ") : String(queryList),
          };
        } else if (event?.web_research) {
          const sources = event.web_research.sources_gathered || [];
          const numSources = sources.length;
          const uniqueLabels = [
            ...new Set(sources.map((s: any) => s?.label).filter(Boolean)),
          ];
          const exampleLabels = uniqueLabels.slice(0, 3).join(", ");
          processedEvent = {
            title: "Web Research",
            data: `Gathered ${numSources} sources. Related to: ${
              exampleLabels || "N/A"
            }.`,
          };
        } else if (event?.reflection) {
          const followUpQueries = event.reflection.follow_up_queries;
          processedEvent = {
            title: "Reflection",
            data: event.reflection.is_sufficient
              ? "Search successful, generating final answer."
              : `Need more information, searching for ${
                  Array.isArray(followUpQueries)
                    ? followUpQueries.join(", ")
                    : followUpQueries || "additional information"
                }`,
          };
        } else if (event?.finalize_answer) {
          processedEvent = {
            title: "Finalizing Answer",
            data: "Composing and presenting the final answer.",
          };
          hasFinalizeEventOccurredRef.current = true;
        }

        if (processedEvent) {
          setProcessedEventsTimeline((prevEvents) => [
            ...prevEvents,
            processedEvent!,
          ]);
        }
      } catch (error) {
        console.error('Error processing event:', error, event);
      }
    },
  });

  const handleSelectChat = async (newChatId: string | null) => {
    if (currentChatId === newChatId) return;

    if (thread.isLoading) {
      thread.stop();
    }
    setDisplayedMessages([]);
    setProcessedEventsTimeline([]);
    setCurrentStreamChatId(null);

    if (!newChatId) {
      setCurrentChatId(null);
      console.log("Chat Cleared: No chat selected.");
      return;
    }

    setCurrentChatId(newChatId);
    setIsMessagesLoading(true);
    console.log("Loading Chat: Fetching messages for chat...");

    try {
      const history = await apiClient.fetchChatMessages(newChatId);
      const transformedMessages = history.messages.map((msg): Message => {
        let role: "user" | "assistant" | "tool" | "system" = "system";
        if (msg.type === 'human') role = 'user';
        else if (msg.type === 'ai') role = 'assistant';
        else if (msg.type === 'tool') role = 'tool';
        
        return {
          id: msg.id!,
          type: role,
          content: msg.content,
          name: msg.name,
          tool_calls: msg.tool_calls,
        } as Message;
      });
      setDisplayedMessages(transformedMessages);
      console.log("Chat history loaded.");
    } catch (error) {
      console.error("Failed to fetch chat messages:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`Failed to load chat history: ${errorMessage}`);
      setDisplayedMessages([]);
    } finally {
      setIsMessagesLoading(false);
    }
  };


  // --- MODIFIED: handleCreateNewChat now updates the 'chats' state directly ---
  const handleCreateNewChat = async () => {
    if (!user) {
      console.error("Authentication Error: You must be logged in to create a chat.");
      return null;
    }
    try {
      // Give the new chat a temporary name until the first message
      const newChat = await apiClient.createChat({ chat_name: "New Chat" });
      if (newChat) {
        // Add the new chat to the top of the list for immediate UI update
        setChats(prevChats => [newChat, ...prevChats]);
        
        // Switch to the new chat
        thread.stop?.();
        setCurrentChatId(newChat.chat_id);
        setDisplayedMessages([]);
        setProcessedEventsTimeline([]);
        setCurrentStreamChatId(null);
        
        console.log(`Chat created: Switched to new chat: ${newChat.chat_name}`);
        return newChat.chat_id;
      }
    } catch (error) {
      console.error("Failed to create new chat:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`Failed to create chat: ${errorMessage}`);
    }
    return null;
  };
  
  // ... (useEffect for post-login submission and other hooks remain the same) ...
  useEffect(() => {
    if (user && !isAuthLoading && pendingSubmission) {
      const executePendingSubmission = async () => {
        const { inputValue, effort, model } = pendingSubmission;
        console.log("Executing pending submission after login...");
        
        const newChatId = await handleCreateNewChat();
        if (newChatId) {
          // This logic is a safe-subset of handleSubmit, tailored for a new chat
          let initial_search_query_count = 0;
          let max_research_loops = 0;
          switch (effort) {
            case "low": initial_search_query_count = 1; max_research_loops = 1; break;
            case "medium": initial_search_query_count = 3; max_research_loops = 3; break;
            case "high": initial_search_query_count = 5; max_research_loops = 10; break;
          }

          const humanMessage: Message = {
            type: "human",
            content: inputValue,
            id: Date.now().toString(),
          };
          
          thread.stop?.();
          setCurrentStreamChatId(newChatId);
          setDisplayedMessages([humanMessage]);
          setProcessedEventsTimeline([]);
          hasFinalizeEventOccurredRef.current = false;

          thread.submit({
              messages: [humanMessage],
              initial_search_query_count,
              max_research_loops,
              reasoning_model: model,
              configurable: { thread_id: newChatId },
            });
          
          // Clear the pending submission now that it has been handled
          setPendingSubmission(null);
        } else {
          console.error("Failed to create a new chat for the pending submission.");
          setPendingSubmission(null); // Also clear on failure to prevent loops
        }
      };

      executePendingSubmission();
    }
  }, [user, isAuthLoading, pendingSubmission, handleCreateNewChat, thread]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollViewport = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollViewport) {
        scrollViewport.scrollTop = scrollViewport.scrollHeight;
      }
    }
  }, [displayedMessages]);

  useEffect(() => {
    if (
      hasFinalizeEventOccurredRef.current &&
      !thread.isLoading &&
      displayedMessages.length > 0 &&
      currentChatId === currentStreamChatId
    ) {
      const lastMessage = displayedMessages[displayedMessages.length - 1];
      if (lastMessage && lastMessage.type === "ai" && lastMessage.id) {
        setHistoricalActivities((prev) => ({
          ...prev,
          [lastMessage.id!]: [...processedEventsTimeline],
        }));
      }
    }
  }, [displayedMessages, thread.isLoading, processedEventsTimeline, currentChatId, currentStreamChatId]);


  const handleSubmit = useCallback(
    (submittedInputValue: string, effort: string, model: string) => {
      if (!submittedInputValue.trim() || !currentChatId) {
        if (!currentChatId) {
          console.error("No Chat Selected: Please select or create a chat to send a message.");
        }
        return;
      }

      if (currentStreamChatId !== currentChatId) {
        thread.stop?.();
        setCurrentStreamChatId(currentChatId);
        setProcessedEventsTimeline([]);
      }

      setProcessedEventsTimeline([]);
      hasFinalizeEventOccurredRef.current = false;

      let initial_search_query_count = 0;
      let max_research_loops = 0;
      switch (effort) {
        case "low": initial_search_query_count = 1; max_research_loops = 1; break;
        case "medium": initial_search_query_count = 3; max_research_loops = 3; break;
        case "high": initial_search_query_count = 5; max_research_loops = 10; break;
      }

      const humanMessage: Message = {
        type: "human",
        content: submittedInputValue,
        id: Date.now().toString(),
      };
      setDisplayedMessages(prevMessages => [...prevMessages, humanMessage]);

      thread.submit(
        {
          messages: [...displayedMessages, humanMessage],
          initial_search_query_count: initial_search_query_count,
          max_research_loops: max_research_loops,
          reasoning_model: model,
          configurable: { thread_id: currentChatId },
        }
      );
    },
    [thread, currentChatId, displayedMessages, currentStreamChatId]
  );

  const handleCancel = useCallback(() => {
    thread.stop();
    window.location.reload();
  }, [thread]);

  return (
    <div className="flex h-screen bg-neutral-800 text-neutral-100 font-sans antialiased">
      {user && (
        // --- MODIFIED: Pass the new state and handlers down to the sidebar ---
        <ChatHistorySidebar
          chats={chats}
          isLoading={isChatListLoading}
          error={chatListError}
          currentChatId={currentChatId}
          onSelectChat={handleSelectChat}
          onCreateNewChat={handleCreateNewChat}
          onChatDeleted={handleChatDeleted}
          onRenameChat={handleRenameChat}
        />
      )}
      <main className={`h-full flex flex-col flex-grow ${user ? 'w-[calc(100%-16rem)]' : 'w-full max-w-4xl mx-auto'}`}>
        {/* ... (The rest of the JSX remains the same) ... */}
        <div className="p-4 border-b border-neutral-700 flex justify-between items-center">
          <a href="https://search.akjo.eu">
            <h1 className="text-xl font-semibold">Deep Research Agent</h1>
          </a>
          <div>
            {isAuthLoading ? (
              <span>Loading...</span>
            ) : user ? (
              <div className="relative">
                <button onClick={() => setIsDropdownOpen(!isDropdownOpen)} className="flex items-center gap-2">
                  <span className="text-sm">{user.name || user.email}</span>
                  {user.picture && <img src={user.picture} alt="User" className="w-8 h-8 rounded-full" />}
                </button>
                {isDropdownOpen && (
                  <div className="absolute right-0 mt-2 py-2 w-48 bg-neutral-700 rounded-md shadow-xl z-20">
                    <button
                      onClick={() => {
                        logout();
                        setIsDropdownOpen(false);
                      }}
                      className="block px-4 py-2 text-sm text-neutral-100 hover:bg-red-600 w-full text-left"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setIsLoginModalVisible(true)}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm"
              >
                Sign in with Google
              </button>
            )}
          </div>
        </div>
        <div className="flex-grow overflow-y-auto">
          {!user ? (
            <WelcomeScreen
              handleSubmit={(inputValue, effort, model) => {
                if (!inputValue.trim()) return;
                setPendingSubmission({ inputValue, effort, model });
                setIsLoginModalVisible(true);
              }}
              isLoading={false}
              onCancel={() => {}}
            />
          ) : currentChatId ? (
            displayedMessages.length === 0 && !(thread.isLoading && currentChatId === currentStreamChatId) ? (
              <WelcomeScreen
                handleSubmit={handleSubmit}
                isLoading={thread.isLoading && currentChatId === currentStreamChatId}
                onCancel={handleCancel}
              />
            ) : (
              <ChatMessagesView
                chatId={currentChatId}
                messages={displayedMessages}
                isLoading={(thread.isLoading && currentChatId === currentStreamChatId) || isMessagesLoading}
                scrollAreaRef={scrollAreaRef}
                onSubmit={handleSubmit}
                onCancel={handleCancel}
                liveActivityEvents={processedEventsTimeline}
                historicalActivities={historicalActivities}
              />
            )
          ) : (
            <WelcomeScreen
              handleSubmit={async (inputValue, effort, model) => {
                if (!inputValue.trim()) return;
                const newChatId = await handleCreateNewChat();
                if (newChatId) {
                  handleSubmit(inputValue, effort, model);
                }
              }}
              isLoading={(thread.isLoading && currentChatId === currentStreamChatId) || isMessagesLoading}
              onCancel={handleCancel}
            />
          )}
        </div>
        <footer className="p-2 text-center text-xs text-neutral-500 border-t border-neutral-700">
          Built with ❤️ by Akshay Joshi using LangChain & LangGraph.
        </footer>
      </main>
      
      {isLoginModalVisible && (
        <LoginPopup
            onLogin={() => {
                login();
                setIsLoginModalVisible(false);
            }}
            onClose={() => setIsLoginModalVisible(false)}
        />
      )}
    </div>
  );
}