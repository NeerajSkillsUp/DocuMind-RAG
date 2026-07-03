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
    setUploadStep('Extracting text...');

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

      setUploadStep('Indexed!');
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
    setMessages(prev => [...prev, { role: 'bot', text: 'Spawning new conversational intelligence context session layers...' }]);
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

      setMessages(prev => prev.filter(m => !m.text.includes('Spawning new conversational')));
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
      setMessages(prev => prev.filter(m => !m.text.includes('Spawning new conversational')));
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
    <div className="h-screen max-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans overflow-hidden select-none">
      
      <style>{`
        html, body, #root { height: 100vh; max-height: 100vh; overflow: hidden !important; margin: 0; padding: 0; }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 9999px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #10b981; }
      `}</style>

      {/* GLOBAL APPLICATION HEADER */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <Layers className="h-6 w-6 text-emerald-400" />
          <h1 className="text-xl font-bold tracking-wide bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
            DocuMind RAG Workspace
          </h1>
        </div>
        {activeConversationId && (
          <button 
            onClick={() => { setMessages([]); setActiveConversationId(null); }}
            className="text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer"
          >
            + New Thread Focus
          </button>
        )}
      </header>

      {/* DASHBOARD SPLIT GRID PANELS */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        
        {/* PANEL LEFT: SIDEBAR INVENTORY & RECENT LOGS */}
        <aside className="w-80 bg-slate-900/50 border-r border-slate-800 p-5 flex flex-col space-y-5 h-full overflow-hidden shrink-0">
          
          {/* UPLOAD TRIGGER CONTROL */}
          <div className="shrink-0">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Ingest Knowledge Base
            </h2>
            <div 
              onClick={() => !uploading && fileInputRef.current?.click()}
              className={`border-2 border-dashed border-slate-800 hover:border-emerald-500 rounded-xl p-4 text-center bg-slate-900/40 transition group flex flex-col items-center justify-center ${uploading ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}
            >
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf,.txt" className="hidden" />
              {uploading ? (
                <>
                  <Loader2 className="h-6 w-6 text-emerald-400 animate-spin mb-1" />
                  <p className="text-xs text-slate-200 font-medium font-mono animate-pulse">{uploadStep}</p>
                </>
              ) : (
                <>
                  <UploadCloud className="h-6 w-6 text-slate-500 group-hover:text-emerald-400 mb-1 transition" />
                  <p className="text-xs font-medium text-slate-300">Upload Additional File</p>
                </>
              )}
            </div>
          </div>

          {/* ACTIVE RETRIEVAL SELECTION ZONE */}
          <div className="flex flex-col shrink-0 min-h-0">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Search Scope Filters
            </h2>

            <button
              onClick={() => {
                setIsGlobalMode(!isGlobalMode);
                setSelectedDocIds([]);
                setActiveConversationId(null);
              }}
              className={`w-full flex items-center space-x-3 p-3 rounded-xl border mb-3 text-left transition text-sm cursor-pointer ${
                isGlobalMode 
                  ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' 
                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-300'
              }`}
            >
              <Globe className={`h-4 w-4 ${isGlobalMode ? 'text-emerald-400' : 'text-slate-500'}`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">Global Workspace</p>
                <p className="text-[11px] text-slate-500 truncate">Queries all datasets simultaneously</p>
              </div>
            </button>

            {/* ENHANCED WORKSPACE FIX: Dynamic scroll area for hundreds of loaded files */}
            <div className="max-h-40 overflow-y-auto space-y-2 pr-1 border-b border-slate-800/60 pb-4 custom-scrollbar flex-1">
              {documents.length === 0 ? (
                <p className="text-xs text-slate-600 italic text-center mt-2">No documents uploaded yet.</p>
              ) : (
                documents.map((doc) => {
                  const isChecked = selectedDocIds.includes(doc.id);
                  return (
                    <div 
                      key={doc.id}
                      onClick={() => toggleDocSelection(doc.id)}
                      className={`flex items-center space-x-3 p-2 rounded-xl border cursor-pointer transition text-xs group ${
                        isChecked && !isGlobalMode
                          ? 'bg-slate-900 border-emerald-500/40 text-slate-200' 
                          : 'bg-slate-900/30 border-slate-800/60 hover:border-slate-700 text-slate-400'
                      }`}
                    >
                      {isGlobalMode ? (
                        <Square className="h-3.5 w-3.5 text-slate-700 shrink-0" />
                      ) : isChecked ? (
                        <CheckSquare className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <Square className="h-3.5 w-3.5 text-slate-600 shrink-0" />
                      )}
                      <FileText className="h-3.5 w-3.5 text-teal-500 shrink-0" />
                      <span className="truncate flex-1 font-medium">{doc.name}</span>
                      
                      {/* HOVER DELETE: Individual document execution wire */}
                      <button 
                        onClick={(e) => { e.stopPropagation(); deleteDocument(doc.id); }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-400 text-slate-600 transition shrink-0"
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
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-slate-500" /> Recent Activity Logs
              </h2>
              <span className="text-[10px] font-mono text-slate-500 bg-slate-950 px-2 py-0.5 rounded-full border border-slate-900">
                {chatHistory.length} listed
              </span>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {chatHistory.length === 0 ? (
                <p className="text-[11px] text-slate-600 italic text-center mt-4">No past execution logs found.</p>
              ) : (
                chatHistory.map((session, sIdx) => {
                  const isActive = activeConversationId === session.conversation_id;
                  return (
                    <div 
                      key={session.id || sIdx} 
                      onClick={() => loadPastConversation(session.conversation_id)}
                      className={`border p-2.5 rounded-xl text-[11px] transition group cursor-pointer flex gap-2 items-start relative overflow-hidden ${
                        isActive 
                          ? 'bg-emerald-950/20 border-emerald-500/50 text-slate-200' 
                          : 'bg-slate-900/40 border-slate-800/60 hover:bg-slate-900/80 text-slate-400'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className={`font-medium truncate mb-1 transition ${isActive ? 'text-emerald-400' : 'text-slate-300 group-hover:text-emerald-400'}`}>
                          Q: {session.question || "Context Question"}
                        </div>
                        <div className="text-slate-500 line-clamp-2 leading-relaxed pl-2 border-l border-slate-800 select-text">
                          {session.answer || "No response text logged."}
                        </div>
                      </div>

                      {/* HOVER DELETE: Individual log cleanup wire */}
                      <button 
                        onClick={(e) => { e.stopPropagation(); deleteConversationLog(session.conversation_id); }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-400 text-slate-600 transition shrink-0 self-center"
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
        <main className="flex-1 flex flex-col bg-slate-950 h-full min-h-0 overflow-hidden">
          
          {/* Messages Stream Wrapper */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 select-text custom-scrollbar">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-3 select-none">
                <Bot className="h-12 w-12 text-slate-700" />
                <h3 className="text-lg font-semibold text-slate-400">RAG Pipeline Standby</h3>
                <p className="text-sm text-slate-500">
                  {!hasContext 
                    ? "Select search filters or enable Global Workspace mode to begin." 
                    : "Enter an execution question below to query targeted data pools."
                  }
                </p>
              </div>
            ) : (
              messages.map((m, idx) => (
                <div key={idx} className={`flex items-start space-x-4 max-w-3xl ${m.role === 'user' ? 'ml-auto flex-row-reverse space-x-reverse' : ''}`}>
                  <div className={`p-2 rounded-xl border shrink-0 ${m.role === 'user' ? 'bg-emerald-600/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-900 border-slate-800 text-teal-400'}`}>
                    {m.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </div>
                  <div className={`rounded-2xl p-4 max-w-xl ${m.role === 'user' ? 'bg-emerald-600 text-white rounded-tr-none' : 'bg-slate-900 border border-slate-800/80 rounded-tl-none'}`}>
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
                        <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 space-y-3 select-none">
                          <p className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Retrieved Context Sources:</p>
                          <div className="grid grid-cols-1 gap-3">
                            {Object.entries(groupedSources).map(([docName, snippets], dIdx) => (
                              <div key={dIdx} className="bg-slate-950/70 rounded-xl border border-slate-800 overflow-hidden shadow-sm">
                                <div className="bg-slate-900/60 px-3 py-2 border-b border-slate-800/60 flex items-center gap-2">
                                  <span className="text-xs">📄</span>
                                  <span className="truncate font-semibold text-slate-200 text-xs tracking-wide">{docName}</span>
                                  <span className="ml-auto bg-slate-800 text-slate-400 text-[10px] font-mono px-2 py-0.5 rounded-full">{snippets.length} matches</span>
                                </div>
                                <div className="p-3 space-y-2.5 divide-y divide-slate-900/60">
                                  {snippets.map((snippet, sIdx) => (
                                    <div key={sIdx} className={sIdx > 0 ? "pt-2.5" : ""}>
                                      <div className="flex items-center text-[10px] font-mono text-emerald-400 mb-1">
                                        <span className="bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded text-[9px]">Page {snippet.page}</span>
                                      </div>
                                      <p className="text-[11px] text-slate-400 leading-relaxed italic select-text pl-1 border-l-2 border-slate-800">
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
                <div className="p-2 rounded-xl border bg-slate-900 border-slate-800 text-teal-400 shrink-0">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl rounded-tl-none p-4 text-slate-400 text-sm animate-pulse flex-1">
                  Querying vector layers and computing cross-document response...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* INPUT DISPATCH PANEL CONTAINER */}
          <div className="p-4 bg-slate-900/40 border-t border-slate-800/80 shrink-0">
            <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex items-center space-x-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder={!hasContext ? "Select a document or enable Global mode to type..." : "Query your targeted knowledge pools..."}
                disabled={!hasContext || loadingAnswer}
                className="flex-1 bg-slate-900 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-4 py-3 text-sm placeholder-slate-500 outline-none transition disabled:opacity-40 select-text"
              />
              <button
                type="submit"
                disabled={!hasContext || !inputMessage.trim() || loadingAnswer}
                className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 text-slate-950 disabled:text-slate-600 p-3 rounded-xl font-medium transition shrink-0 cursor-pointer"
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