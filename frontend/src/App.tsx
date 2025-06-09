import { useStream } from "@langchain/langgraph-sdk/react";
import type { Message } from "@langchain/langgraph-sdk";
import { useState, useEffect, useRef, useCallback } from "react";
import { ProcessedEvent } from "@/components/ActivityTimeline";
import { WelcomeScreen } from "@/components/WelcomeScreen";
import { ChatMessagesView } from "@/components/ChatMessagesView";
import { useAuth } from "./context/AuthContext";
import ChatHistorySidebar from './components/ChatHistorySidebar'; // Added
// import { Toaster } from "@/components/ui/toaster"; // REMOVED
// import { useToast } from "@/components/ui/use-toast"; // REMOVED
import * as apiClient from './lib/apiClient'; // Added

export default function App() {
  const { user, isLoading: isAuthLoading, login, logout } = useAuth();
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  // const { toast } = useToast(); // REMOVED
  const [displayedMessages, setDisplayedMessages] = useState<Message[]>([]); 
  const [currentStreamChatId, setCurrentStreamChatId] = useState<string | null>(null); 
  const [isMessagesLoading, setIsMessagesLoading] = useState(false); // Added state for loading history

  const [processedEventsTimeline, setProcessedEventsTimeline] = useState<
    ProcessedEvent[]
  >([]);
  const [historicalActivities, setHistoricalActivities] = useState<
    Record<string, ProcessedEvent[]>
  >({});
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const hasFinalizeEventOccurredRef = useRef(false);

  // TODO: The 'thread' from useStream is currently global.
  // For multi-chat, this needs to be instantiated or managed per chat_id,
  // or ChatMessagesView/InputForm need to handle message loading/sending via API
  // calls to the backend, which then interacts with LangGraph.
  // This is a significant change beyond this subtask.
  // For now, new chats created via sidebar might not integrate with this `thread` instance.
  const thread = useStream<{
    messages: Message[];
    initial_search_query_count: number;
    max_research_loops: number;
    reasoning_model: string;
    configurable?: { thread_id: string | null }; // Added configurable to the state definition
  }>({
    apiUrl: import.meta.env.DEV
      ? "http://localhost:2024"
      : "http://localhost:8123",
    assistantId: "agent",
    messagesKey: "messages",
    onFinish: (event: any) => {
      console.log('Finish event for stream, related to chat:', currentStreamChatId, event);
      // Potentially finalize activities for currentStreamChatId here
      // This ensures that historical activities are associated with the correct chat.
      if (currentChatId === currentStreamChatId && hasFinalizeEventOccurredRef.current) {
        const lastMessage = displayedMessages[displayedMessages.length - 1];
        if (lastMessage && lastMessage.type === "ai" && lastMessage.id) {
          setHistoricalActivities((prev) => ({
            ...prev,
            [lastMessage.id!]: [...processedEventsTimeline],
          }));
        }
        hasFinalizeEventOccurredRef.current = false;
      }
    },
    onUpdateEvent: (event: any) => {
      console.log('Received stream event for chat:', currentStreamChatId, event);
      // Only update displayedMessages if the event is for the currently selected chat
      if (event?.messages && currentChatId === currentStreamChatId) {
        setDisplayedMessages(event.messages);
      }

      // Process activity timeline
      // Note: The logic for setProcessedEventsTimeline might need to become more explicitly chatId-aware,
      // especially if multiple streams could theoretically update it.
      // For now, it's reset when chat changes or new message submitted.
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

  const handleSelectChat = async (newChatId: string | null) => { // Renamed chatId to newChatId for clarity
    if (currentChatId === newChatId) return; 

    // Stop existing stream and clear messages for the old chat
    // thread.stop?.(); // This might be too aggressive if user quickly clicks back
    if (thread.isLoading) { // More explicit check
        thread.stop();
    }
    setDisplayedMessages([]); 
    setProcessedEventsTimeline([]); 
    setCurrentStreamChatId(null); 

    if (!newChatId) {
        setCurrentChatId(null);
        // toast({ title: "Chat Cleared", description: "No chat selected." }); // REMOVED
        console.log("Chat Cleared: No chat selected.");
        return;
    }

    setCurrentChatId(newChatId);
    setIsMessagesLoading(true);
    // toast({ title: "Loading Chat", description: `Fetching messages for chat...` }); // REMOVED
    console.log("Loading Chat: Fetching messages for chat...");

    try {
      const history = await apiClient.fetchChatMessages(newChatId);
      const transformedMessages = history.messages.map((msg): Message => {
        let role: "user" | "assistant" | "tool" | "system" = "system"; 
        if (msg.type === 'human') role = 'user';
        else if (msg.type === 'ai') role = 'assistant';
        else if (msg.type === 'tool') role = 'tool';
        
        // The Message type from @langchain/langgraph-sdk expects 'content' not 'text'
        // Ensure your frontend Message type matches what ChatMessagesView expects
        // If ChatMessagesView expects `text`, adapt here. If it expects `content`, this is fine.
        // For this example, I'll assume ChatMessagesView might use a 'text' prop from an older version
        // or that our Message type alias in App.tsx needs to be consistent.
        // Given `type Message` from `@langchain/langgraph-sdk` uses `content`, let's stick to that.
        return {
          // id: msg.id || Math.random().toString(36).substring(7), // Backend now provides ID for messages
          id: msg.id!, // Assuming backend message ID is always present and string
          type: role, // Map to 'user', 'assistant', 'tool', 'system'
          content: msg.content,
          name: msg.name,
          tool_calls: msg.tool_calls,
          // tool_call_id: msg.tool_call_id, // SDK Message doesn't have this directly
        } as Message; // Cast to SDK Message type
      });
      setDisplayedMessages(transformedMessages);
      // toast({ title: "Chat history loaded." }); // REMOVED
      console.log("Chat history loaded.");
    } catch (error) {
      console.error("Failed to fetch chat messages:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      // toast({ title: "Error", description: `Failed to load chat history: ${errorMessage}`, variant: "destructive" }); // REMOVED
      console.error(`Failed to load chat history: ${errorMessage}`);
      setDisplayedMessages([]); 
    } finally {
      setIsMessagesLoading(false);
    }
  };

  const handleCreateNewChat = async () => {
    if (!user) {
        // toast({ title: "Authentication Error", description: "You must be logged in to create a chat.", variant: "destructive" }); // REMOVED
        console.error("Authentication Error: You must be logged in to create a chat.");
        return null; 
    }
    try {
      const newChat = await apiClient.createChat({ chat_name: "New Chat" });
      if (newChat) {
        thread.stop?.(); 
        setCurrentChatId(newChat.chat_id);
        setDisplayedMessages([]); 
        setProcessedEventsTimeline([]); 
        // setCurrentStreamChatId(newChat.chat_id); // Associate stream with this new chat immediately
        setCurrentStreamChatId(null); // Or wait for first message submission
        // toast({ title: "Chat created", description: `Switched to new chat: ${newChat.chat_name}` }); // REMOVED
        console.log(`Chat created: Switched to new chat: ${newChat.chat_name}`);
        return newChat.chat_id; 
      }
    } catch (error) {
        console.error("Failed to create new chat:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        // toast({ title: "Error", description: `Failed to create chat: ${errorMessage}`, variant: "destructive" }); // REMOVED
        console.error(`Failed to create chat: ${errorMessage}`);
    }
    return null; 
  };

  // Effect to update displayed messages from stream IF it's for the current chat
  // This effect is removed as onUpdateEvent now directly updates displayedMessages if chat IDs match.
  // useEffect(() => {
  //   if (thread.messages && currentChatId === currentStreamChatId) {
  //     setDisplayedMessages(thread.messages);
  //   }
  // }, [thread.messages, currentChatId, currentStreamChatId]);


  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollViewport = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollViewport) {
        scrollViewport.scrollTop = scrollViewport.scrollHeight;
      }
    }
  }, [displayedMessages]); // Changed from thread.messages to displayedMessages

  useEffect(() => {
    // This logic for historicalActivities is now partly in onFinish callback.
    // This effect might still be useful if onFinish doesn't capture all cases,
    // or if we want to save history more frequently.
    // However, ensure it's also currentChatId === currentStreamChatId aware.
    if (
      hasFinalizeEventOccurredRef.current &&
      !thread.isLoading && //isLoading is still from the global thread object
      displayedMessages.length > 0 && 
      currentChatId === currentStreamChatId 
    ) {
      const lastMessage = displayedMessages[displayedMessages.length - 1];
      if (lastMessage && lastMessage.type === "ai" && lastMessage.id) {
        // Consider if processedEventsTimeline also needs to be explicitly cleared/managed per chat
        setHistoricalActivities((prev) => ({ 
          ...prev,
          [lastMessage.id!]: [...processedEventsTimeline],
        }));
      }
      // hasFinalizeEventOccurredRef.current = false; // Moved to onFinish, or reset per chat action
    }
  }, [displayedMessages, thread.isLoading, processedEventsTimeline, currentChatId, currentStreamChatId]);


  const handleSubmit = useCallback(
    (submittedInputValue: string, effort: string, model: string) => {
      if (!submittedInputValue.trim() || !currentChatId) {
        if (!currentChatId) {
            // toast({ title: "No Chat Selected", description: "Please select or create a chat to send a message.", variant: "destructive"}); // REMOVED
            console.error("No Chat Selected: Please select or create a chat to send a message.");
        }
        return;
      }

      // If the stream is not for the current chat, or if it's the first message for this chat
      if (currentStreamChatId !== currentChatId) {
        thread.stop?.(); 
        setCurrentStreamChatId(currentChatId); // Associate stream with the current chat
        // setDisplayedMessages([]); // Clear messages from old stream, or rely on history load
        setProcessedEventsTimeline([]); 
      }
      
      setProcessedEventsTimeline([]); 
      hasFinalizeEventOccurredRef.current = false;

      let initial_search_query_count = 0;
      let max_research_loops = 0;
      switch (effort) {
        case "low":
          initial_search_query_count = 1;
          max_research_loops = 1;
          break;
        case "medium":
          initial_search_query_count = 3;
          max_research_loops = 3;
          break;
        case "high":
          initial_search_query_count = 5;
          max_research_loops = 10;
          break;
      }

      const humanMessage: Message = {
        type: "human",
        content: submittedInputValue,
        id: Date.now().toString(),
      };
      // Optimistically update displayedMessages
      setDisplayedMessages(prevMessages => [...prevMessages, humanMessage]);

      // Send all currently displayed messages for context, plus the new one.
      // Or, if backend handles history via thread_id, only send the new humanMessage.
      // Current approach: send current displayed messages + new human message.
      // This assumes `useStream` messages are not automatically persisted and reloaded by `configurable.thread_id` alone.
      // If they are, then `messages: [humanMessage]` might be enough after history is loaded.
      thread.submit(
        { // First argument: input
          messages: [...displayedMessages, humanMessage], 
          initial_search_query_count: initial_search_query_count,
          max_research_loops: max_research_loops,
          reasoning_model: model,
          configurable: { thread_id: currentChatId }, // configurable is part of the input object
        }
        // No second argument is needed if all options are part of the input.
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
      {user && ( // Only show sidebar if user is logged in
        <ChatHistorySidebar
            currentChatId={currentChatId}
            onSelectChat={handleSelectChat}
            onCreateNewChat={handleCreateNewChat}
        />
      )}
      {/* Adjust width of main content area based on sidebar visibility */}
      <main className={`h-full flex flex-col flex-grow ${user ? 'w-[calc(100%-16rem)]' : 'w-full max-w-4xl mx-auto'}`}>
        <div className="p-4 border-b border-neutral-700 flex justify-between items-center">
        <a href="https://search.akjo.eu"> {/* Consider making this dynamic or removing if sidebar has navigation */}
          <h1 className="text-xl font-semibold">Deep Research Agent</h1>
        </a>
          <div>
            {isAuthLoading ? (
              <span>Loading...</span>
            ) : user ? (
              <div className="flex items-center gap-2">
                <span className="text-sm">{user.name || user.email}</span>
                {user.picture && <img src={user.picture} alt="User" className="w-8 h-8 rounded-full" />}
                <button
                  onClick={() => logout()}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-white text-sm"
                >
                  Logout
                </button>
              </div>
            ) : (
              <button
                onClick={() => login()}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm"
              >
                Sign in with Google
              </button>
            )}
          </div>
        </div>
        <div className="flex-grow overflow-hidden">
          {!user ? ( // If not logged in, show a prompt to sign in
            <div className="flex flex-col items-center justify-center h-full">
                <h2 className="text-2xl mb-4">Welcome!</h2>
                <p className="mb-6">Please sign in to access your chat history and start new conversations.</p>
                <button
                    onClick={() => login()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white text-lg"
                >
                    Sign in with Google
                </button>
            </div>
          ) : currentChatId ? (
            // If a chat is selected, display the chat interface for it.
            // This currently uses the global `thread` object from `useStream`.
            // TODO: This section needs to be refactored for true multi-chat functionality.
            // ChatMessagesView and handleSubmit (via InputForm) should be scoped to currentChatId.
            // This might involve:
            // 1. Passing currentChatId to ChatMessagesView and InputForm.
            // 2. ChatMessagesView fetching/receiving messages for currentChatId.
            // 3. InputForm's submit action sending messages to backend API for currentChatId.
            // 4. The `useStream` hook might need to be re-instantiated or its data managed differently.
            // Now using displayedMessages and checking isLoading against currentStreamChatId
            displayedMessages.length === 0 && !(thread.isLoading && currentChatId === currentStreamChatId) ? (
                <WelcomeScreen
                  handleSubmit={(inputValue, effort, model) => {
                    // handleSubmit is now aware of currentChatId
                    handleSubmit(inputValue, effort, model);
                  }}
                  isLoading={thread.isLoading && currentChatId === currentStreamChatId} // Show loading if stream is for current chat
                  onCancel={handleCancel}
                />
              ) : (
                <ChatMessagesView
                  chatId={currentChatId} 
                  messages={displayedMessages} 
                  isLoading={(thread.isLoading && currentChatId === currentStreamChatId) || isMessagesLoading} // Combined loading state
                  scrollAreaRef={scrollAreaRef}
                  onSubmit={handleSubmit} 
                  onCancel={handleCancel}
                  liveActivityEvents={processedEventsTimeline} // This might need to be chat-specific
                  historicalActivities={historicalActivities} // This is already somewhat chat-specific by message ID
                />
              )
          ) : (
            // If logged in but no chat is selected (e.g., after login, or if currentChatId is null)
            <WelcomeScreen
              handleSubmit={async (inputValue, effort, model) => {
                if (!currentChatId) { // If no chat is active, create one first
                  // toast({ title: "Starting new chat...", description: "Please wait."}); // REMOVED
                  console.log("Starting new chat... Please wait.");
                  const newChatId = await handleCreateNewChat(); // Wait for new chat to be created
                  if (newChatId) {
                    // handleSubmit will be called with newChatId as currentChatId due to state update by handleCreateNewChat
                    // and subsequent re-render. handleSubmit will pick up the latest currentChatId.
                     handleSubmit(inputValue, effort, model);
                  } else {
                    // toast({ title: "Error", description: "Could not create a new chat. Please try again.", variant: "destructive"}); // REMOVED
                    console.error("Error: Could not create a new chat. Please try again.");
                  }
                } else {
                  // This case should ideally not happen if WelcomeScreen is only shown when no currentChatId,
                  // but if it does, proceed with the currentChatId.
                  handleSubmit(inputValue, effort, model);
                }
              }}
              isLoading={(thread.isLoading && currentChatId === currentStreamChatId) || isMessagesLoading} 
              onCancel={handleCancel}
            />
          )}
        </div>
      </main>
      {/* <Toaster /> */} {/* REMOVED */}
    </div>
  );
}