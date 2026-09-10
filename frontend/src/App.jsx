import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Layers, UploadCloud, Send, FileText, Bot, User, Loader2, Trash2, CheckSquare, Square, Globe, Clock } from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ||'http://127.0.0.1:8000';

function App() {
  const [documents, setDocuments] = useState(() => {
    const saved = localStorage.getItem('uploaded_documents');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [selectedDocIds, setSelectedDocIds] = useState(() => {
    const saved = localStorage.getItem('selected_doc_ids');
    return saved ? JSON.parse(saved) : [];
  });

  const [isGlobalMode, setIsGlobalMode] = useState(() => {
    return localStorage.getItem('global_mode') === 'true';
  });

  const [uploading, setUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState('');
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loadingAnswer, setLoadingAnswer] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('uploaded_documents', JSON.stringify(documents));
    localStorage.setItem('selected_doc_ids', JSON.stringify(selectedDocIds));
    localStorage.setItem('global_mode', isGlobalMode.toString());
  }, [documents, selectedDocIds, isGlobalMode]);

  useEffect(() => {
    fetchChatHistory();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loadingAnswer]);

  async function fetchChatHistory() {
    try {
      const response = await axios.get(`${BACKEND_URL}/history`);
      setChatHistory(response.data.history || response.data.conversations || response.data || []);
    } catch (error) {
      console.error("Failed to sync chat history records from database server:", error);
    }
  }

  async function loadPastConversation(conversationId) {
    if (!conversationId) return;
    setLoadingAnswer(true);
    setActiveConversationId(conversationId);
    try {
      const response = await axios.get(`${BACKEND_URL}/chat/history/${conversationId}`);
      setMessages(response.data || []);
    } catch (error) {
      console.error("Failed to restore target historical thread context:", error);
      alert("Could not load selected conversation log from database server.");
    } finally {
      setLoadingAnswer(false);
    }
  }

  // GRANULAR DELETION: Targeted document removal
  async function deleteDocument(docId) {
    if (!confirm("Are you sure you want to remove this document asset from your session scope?")) return;
    try {
      await axios.delete(`${BACKEND_URL}/chat/document/${docId}`);
      setDocuments(prev => prev.filter(d => d.id !== docId));
      setSelectedDocIds(prev => prev.filter(id => id !== docId));
    } catch (error) {
      console.error("Failed to drop database asset entity:", error);
      alert("Failed to delete the selected document from server registers.");
    }
  }

  // GRANULAR DELETION: Targeted history log removal
  async function deleteConversationLog(conversationId) {
    if (!confirm("Permanently delete this specific conversation thread history from DB logs?")) return;
    try {
      await axios.delete(`${BACKEND_URL}/chat/conversation/${conversationId}`);
      if (activeConversationId === conversationId) {
        setMessages([]);
        setActiveConversationId(null);
      }
      fetchChatHistory();
    } catch (error) {
      console.error("Failed to drop logging segment thread maps:", error);
      alert("Failed to wipe target session tracking layer from server memory.");
    }
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setUploadStep('Reading document...');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${BACKEND_URL}/documents/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      const docId = response.data.doc_id || response.data.id;
      if (!docId) {
        alert("Upload completed, but no document ID was returned by the server.");
        return;
      }

      setUploadStep('Document ready!');
      const newDoc = { id: docId, name: file.name };
      setDocuments(prev => [...prev, newDoc]);
      
      if (!isGlobalMode) {
        setSelectedDocIds(prev => [...prev, docId]);
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert(error.response?.data?.detail || "Failed to parse and upload document.");
    } finally {
      setTimeout(() => {
        setUploading(false);
        setUploadStep('');
      }, 500);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || loadingAnswer) return;
    if (!isGlobalMode && selectedDocIds.length === 0) return;

    const userQuery = inputMessage;
    setInputMessage('');
    setMessages(prev => [...prev, { role: 'user', text: userQuery }]);
    setLoadingAnswer(true);

    try {
      let conversationId = activeConversationId;
      
      if (!conversationId) {
        const routingDocId = isGlobalMode ? "global" : selectedDocIds.join(",");
        const sessionResponse = await axios.post(`${BACKEND_URL}/chat/new/${routingDocId}`);
        conversationId = sessionResponse.data.conversation_id || sessionResponse.data.id;
        if (conversationId) {
          setActiveConversationId(conversationId);
        }
      }

      const response = await axios.post(`${BACKEND_URL}/chat/message/${conversationId}`, {
        content: userQuery
      });

      const assistantText = response.data.answer || response.data.response || response.data.content;
      const sourceChunks = response.data.retrieved_chunks || response.data.sources || [];

      setMessages(prev => [...prev, { 
        role: 'bot', 
        text: assistantText || "Warning: No response content key detected.",
        sources: sourceChunks
      }]);
      
      fetchChatHistory();
    } catch (error) {
      console.error("Query tracking failure:", error);
      setMessages(prev => [...prev, { role: 'bot', text: "Error: Failed to route query messages." }]);
    } finally {
      setLoadingAnswer(false);
    }
  };

  const toggleDocSelection = (id) => {
    setIsGlobalMode(false);
    setSelectedDocIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
    setActiveConversationId(null); 
  };

  const hasContext = isGlobalMode || selectedDocIds.length > 0;

  return (
    <div className="h-screen max-h-screen bg-[#212121] text-[#ececec] flex flex-col font-sans overflow-hidden select-none">
      
      <style>{`
        html, body, #root { height: 100vh; max-height: 100vh; overflow: hidden !important; margin: 0; padding: 0; }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #424242; border-radius: 9999px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #5a5a5a; }
      `}</style>

      {/* GLOBAL APPLICATION HEADER */}
      <header className="bg-[#212121] border-b border-[#2f2f2f] px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <Layers className="h-6 w-6 text-[#ececec]" />
          <h1 className="text-xl font-bold tracking-wide text-[#ececec]">
            DocuMind
          </h1>
        </div>
        {activeConversationId && (
          <button 
            onClick={() => { setMessages([]); setActiveConversationId(null); }}
            className="text-xs bg-[#2f2f2f] hover:bg-[#3a3a3a] text-[#ececec] px-3 py-1.5 rounded-lg font-medium transition cursor-pointer"
          >
            + New Chat
          </button>
        )}
      </header>

      {/* DASHBOARD SPLIT GRID PANELS */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        
        {/* PANEL LEFT: SIDEBAR INVENTORY & RECENT LOGS */}
        <aside className="w-80 bg-[#171717] border-r border-[#2f2f2f] p-5 flex flex-col space-y-5 h-full overflow-hidden shrink-0">
          
          {/* UPLOAD TRIGGER CONTROL */}
          <div className="shrink-0">
            <h2 className="text-xs font-semibold text-[#a0a0a0] uppercase tracking-wider mb-2">
              Your Documents
            </h2>
            <div 
              onClick={() => !uploading && fileInputRef.current?.click()}
              className={`border-2 border-dashed border-[#3a3a3a] hover:border-[#666666] rounded-xl p-4 text-center bg-[#212121] transition group flex flex-col items-center justify-center ${uploading ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}
            >
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf" className="hidden" />
              {uploading ? (
                <>
                  <Loader2 className="h-6 w-6 text-[#ececec] animate-spin mb-1" />
                  <p className="text-xs text-[#d0d0d0] font-medium font-mono animate-pulse">{uploadStep}</p>
                </>
              ) : (
                <>
                  <UploadCloud className="h-6 w-6 text-[#777777] group-hover:text-[#d0d0d0] mb-1 transition" />
                  <p className="text-xs font-medium text-[#d0d0d0]">Add PDF</p>
                </>
              )}
            </div>
          </div>

          {/* ACTIVE RETRIEVAL SELECTION ZONE */}
          <div className="flex flex-col shrink-0 min-h-0">
            <h2 className="text-xs font-semibold text-[#a0a0a0] uppercase tracking-wider mb-2">
              Search in
            </h2>

            <button
              onClick={() => {
                setIsGlobalMode(!isGlobalMode);
                setSelectedDocIds([]);
                setActiveConversationId(null);
              }}
              className={`w-full flex items-center space-x-3 p-3 rounded-xl border mb-3 text-left transition text-sm cursor-pointer ${
                isGlobalMode 
                  ? 'bg-[#2f2f2f] border-[#666666] text-[#ececec]' 
                  : 'bg-[#212121] border-[#2f2f2f] hover:border-[#4a4a4a] text-[#c5c5c5]'
              }`}
            >
              <Globe className={`h-4 w-4 ${isGlobalMode ? 'text-[#ececec]' : 'text-[#777777]'}`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">All documents</p>
                <p className="text-[11px] text-[#888888] truncate">Search across your workspace</p>
              </div>
            </button>

            {/* ENHANCED WORKSPACE FIX: Dynamic scroll area for hundreds of loaded files */}
            <div className="max-h-40 overflow-y-auto space-y-2 pr-1 border-b border-[#2f2f2f] pb-4 custom-scrollbar flex-1">
              {documents.length === 0 ? (
                <p className="text-xs text-[#666666] italic text-center mt-2">No documents uploaded yet.</p>
              ) : (
                documents.map((doc) => {
                  const isChecked = selectedDocIds.includes(doc.id);
                  return (
                    <div 
                      key={doc.id}
                      onClick={() => toggleDocSelection(doc.id)}
                      className={`flex items-center space-x-3 p-2 rounded-xl border cursor-pointer transition text-xs group ${
                        isChecked && !isGlobalMode
                          ? 'bg-[#2f2f2f] border-[#666666] text-[#ececec]' 
                          : 'bg-[#212121] border-[#2f2f2f] hover:border-[#4a4a4a] text-[#a0a0a0]'
                      }`}
                    >
                      {isGlobalMode ? (
                        <Square className="h-3.5 w-3.5 text-[#555555] shrink-0" />
                      ) : isChecked ? (
                        <CheckSquare className="h-3.5 w-3.5 text-[#ececec] shrink-0" />
                      ) : (
                        <Square className="h-3.5 w-3.5 text-[#666666] shrink-0" />
                      )}
                      <FileText className="h-3.5 w-3.5 text-[#888888] shrink-0" />
                      <span className="truncate flex-1 font-medium">{doc.name}</span>
                      
                      {/* HOVER DELETE: Individual document execution wire */}
                      <button 
                        onClick={(e) => { e.stopPropagation(); deleteDocument(doc.id); }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-400 text-[#666666] transition shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* PERSISTENT DB PIPELINE SESSION HISTORY */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <h2 className="text-xs font-semibold text-[#a0a0a0] uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-[#777777]" /> Recent chats
              </h2>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {chatHistory.length === 0 ? (
                <p className="text-[11px] text-[#666666] italic text-center mt-4">No recent chats yet.</p>
              ) : (
                chatHistory.map((session, sIdx) => {
                  const isActive = activeConversationId === session.conversation_id;
                  return (
                    <div 
                      key={session.id || sIdx} 
                      onClick={() => loadPastConversation(session.conversation_id)}
                      className={`border p-2.5 rounded-xl text-[11px] transition group cursor-pointer flex gap-2 items-start relative overflow-hidden ${
                        isActive 
                          ? 'bg-[#2f2f2f] border-[#555555] text-[#ececec]' 
                          : 'bg-[#212121] border-[#2f2f2f] hover:bg-[#252525] text-[#a0a0a0]'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className={`font-medium truncate mb-1 transition ${isActive ? 'text-[#ececec]' : 'text-[#c5c5c5] group-hover:text-[#ececec]'}`}>
                          Q: {session.question || "Context Question"}
                        </div>
                        <div className="text-[#777777] line-clamp-2 leading-relaxed pl-2 border-l border-[#3a3a3a] select-text">
                          {session.answer || "No response yet."}
                        </div>
                      </div>

                      {/* HOVER DELETE: Individual log cleanup wire */}
                      <button 
                        onClick={(e) => { e.stopPropagation(); deleteConversationLog(session.conversation_id); }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-400 text-[#666666] transition shrink-0 self-center"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </aside>

        {/* PANEL RIGHT: STREAM CHAT HUB INTERFACE */}
        <main className="flex-1 flex flex-col bg-[#212121] h-full min-h-0 overflow-hidden">
          
          {/* Messages Stream Wrapper */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 select-text custom-scrollbar">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-3 select-none">
                <Bot className="h-12 w-12 text-[#555555]" />
                <h3 className="text-lg font-semibold text-[#c5c5c5]">How can I help with your documents?</h3>
                <p className="text-sm text-[#888888]">
                  {!hasContext 
                    ? "Add a document to get started." 
                    : "Ask anything about your documents."
                  }
                </p>
              </div>
            ) : (
              messages.map((m, idx) => (
                <div key={idx} className={`flex items-start space-x-4 max-w-3xl ${m.role === 'user' ? 'ml-auto flex-row-reverse space-x-reverse' : ''}`}>
                  <div className={`p-2 rounded-xl border shrink-0 ${m.role === 'user' ? 'bg-[#2f2f2f] border-[#444444] text-[#d0d0d0]' : 'bg-[#212121] border-[#3a3a3a] text-[#a0a0a0]'}`}>
                    {m.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </div>
                  <div className={`rounded-2xl p-4 max-w-xl ${m.role === 'user' ? 'bg-[#2f2f2f] text-[#ececec] rounded-tr-none' : 'bg-transparent border-0 rounded-tl-none'}`}>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.text}</p>
                    
                    {/* SOURCES RENDERING BLOCK */}
                    {m.sources && m.sources.length > 0 && (() => {
                      const groupedSources = m.sources.reduce((acc, src) => {
                        const currentDocName = src.filename || src.metadata?.filename || "Unknown Document";
                        const currentPageNumber = src.page_number ?? src.metadata?.page_number ?? "N/A";
                        const textSnippet = src.text || "";
                        if (!acc[currentDocName]) acc[currentDocName] = [];
                        acc[currentDocName].push({ page: currentPageNumber, text: textSnippet });
                        return acc;
                      }, {});

                      return (
                        <div className="mt-4 pt-3 border-t border-[#3a3a3a] text-xs text-[#a0a0a0] space-y-3 select-none">
                          <p className="font-bold text-[#777777] uppercase tracking-wider text-[10px]">Sources:</p>
                          <div className="grid grid-cols-1 gap-3">
                            {Object.entries(groupedSources).map(([docName, snippets], dIdx) => (
                              <div key={dIdx} className="bg-[#171717] rounded-xl border border-[#2f2f2f] overflow-hidden shadow-sm">
                                <div className="bg-[#212121] px-3 py-2 border-b border-[#2f2f2f] flex items-center gap-2">
                                  <span className="text-xs">📄</span>
                                  <span className="truncate font-semibold text-[#d0d0d0] text-xs tracking-wide">{docName}</span>
                                  <span className="ml-auto bg-[#2f2f2f] text-[#888888] text-[10px] font-mono px-2 py-0.5 rounded-full">{snippets.length} sources</span>
                                </div>
                                <div className="p-3 space-y-2.5 divide-y divide-[#2f2f2f]">
                                  {snippets.map((snippet, sIdx) => (
                                    <div key={sIdx} className={sIdx > 0 ? "pt-2.5" : ""}>
                                      <div className="flex items-center text-[10px] font-mono text-[#a0a0a0] mb-1">
                                        <span className="bg-[#2f2f2f] border border-[#444444] px-1.5 py-0.5 rounded text-[9px]">Page-{snippet.page}</span>
                                      </div>
                                      <p className="text-[11px] text-[#999999] leading-relaxed italic select-text pl-1 border-l-2 border-[#3a3a3a]">
                                        "{snippet.text ? snippet.text.substring(0, 180) + "..." : "Empty chunk content"}"
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))
            )}
            {loadingAnswer && (
              <div className="flex items-start space-x-4 max-w-2xl">
                <div className="p-2 rounded-xl border bg-[#2f2f2f] border-[#444444] text-[#d0d0d0] shrink-0">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
                <div className="bg-[#2f2f2f] border border-[#3a3a3a] rounded-2xl rounded-tl-none p-4 text-[#999999] text-sm animate-pulse flex-1">
                  Searching your documents...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* INPUT DISPATCH PANEL CONTAINER */}
          <div className="p-4 bg-[#212121] border-t border-[#2f2f2f] shrink-0">
            <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex items-center space-x-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder={!hasContext ? "Select a document to start..." : "Ask anything about your documents..."}
                disabled={!hasContext || loadingAnswer}
                className="flex-1 bg-[#2f2f2f] border border-[#444444] focus:border-[#666666] focus:ring-1 focus:ring-[#555555] rounded-xl px-4 py-3 text-sm placeholder-[#777777] outline-none transition disabled:opacity-40 select-text"
              />
              <button
                type="submit"
                disabled={!hasContext || !inputMessage.trim() || loadingAnswer}
                className="bg-[#ececec] hover:bg-white disabled:bg-[#2f2f2f] text-[#171717] disabled:text-[#666666] p-3 rounded-xl font-medium transition shrink-0 cursor-pointer"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>

        </main>
      </div>
    </div>
  );
}

export default App;