// frontend/src/lib/apiClient.ts

export interface Chat {
  chat_id: string;
  user_id: string; // Or remove if not needed on frontend directly often
  chat_name: string;
  created_at: string; // Assuming ISO string format
  updated_at: string; // Assuming ISO string format
}

export interface ChatListResponse {
  chats: Chat[];
}

export interface CreateChatPayload {
    chat_name?: string;
}

export interface UpdateChatPayload {
    chat_name: string;
}


const BASE_URL = '/api'; // Adjust if your API prefix is different

// General request function
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    if (response.status === 401) {
      // Handle unauthorized, e.g., redirect or call auth context logout
      console.error("Unauthorized request");
      // window.location.href = '/app/login'; // Example redirect
    }
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(errorData.detail || errorData.message || `Request failed with status ${response.status}`);
  }
  if (response.status === 204) { // No Content
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export const fetchChats = (): Promise<ChatListResponse> => {
  return request<ChatListResponse>(`${BASE_URL}/chats/`);
};

export const createChat = (payload: CreateChatPayload): Promise<Chat> => {
  return request<Chat>(`${BASE_URL}/chats/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
};

export const updateChat = (chatId: string, payload: UpdateChatPayload): Promise<Chat> => {
  return request<Chat>(`${BASE_URL}/chats/${chatId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
};

export const deleteChat = (chatId: string): Promise<void> => {
  return request<void>(`${BASE_URL}/chats/${chatId}`, {
    method: 'DELETE',
  });
};

// New interfaces and function for chat messages
export interface MessageInterface { // Based on Pydantic Message schema
  id?: string;
  type: string;
  content: string;
  name?: string;
  tool_calls?: any[]; // Consider defining tool_calls structure more precisely
  tool_call_id?: string;
  // created_at?: string; // if you send it
}

export interface MessageListResponseInterface {
  messages: MessageInterface[];
}

export const fetchChatMessages = (chatId: string): Promise<MessageListResponseInterface> => {
  return request<MessageListResponseInterface>(`${BASE_URL}/chats/${chatId}/messages`);
};
