import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  AlertCircle, 
  CheckCircle, 
  RefreshCcw, 
  LogIn, 
  LogOut, 
  MessageSquare, 
  Loader2, 
  ShieldAlert, 
  Sparkles, 
  Clock, 
  Layers, 
  Check, 
  SlidersHorizontal,
  Bot,
  Send,
  Trash2
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001/api';

function App() {
  const [status, setStatus] = useState('disconnected');
  const [qrCode, setQrCode] = useState(null);
  const [groups, setGroups] = useState([]);
  const [monitoredGroup, setMonitoredGroup] = useState('ALL');
  
  const [messages, setMessages] = useState([]);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'review' | 'auto'
  const [reviewModalMsg, setReviewModalMsg] = useState(null);
  const [editCategory, setEditCategory] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (status === 'connected') {
      fetchGroups();
      const interval = setInterval(fetchGroups, 5000);
      return () => clearInterval(interval);
    }
  }, [status]);

  const fetchStatus = async () => {
    try {
      const res = await axios.get(`${API_BASE}/whatsapp/status`);
      setStatus(res.data.status || 'disconnected');
      setQrCode(res.data.qr || null);
      if (res.data.monitoredGroup) {
        setMonitoredGroup(res.data.monitoredGroup);
      }
      if (res.data.groups && res.data.groups.length > 0) {
        setGroups(res.data.groups);
      }
    } catch (e) {
      setStatus('offline');
    }
  };

  const fetchGroups = async () => {
    try {
      const res = await axios.get(`${API_BASE}/whatsapp/groups`);
      setGroups(res.data.groups || []);
    } catch (e) {
      console.error('Failed to fetch groups:', e);
    }
  };

  const fetchMessages = async () => {
    try {
      const res = await axios.get(`${API_BASE}/messages`);
      setMessages(res.data || []);
    } catch (e) {
      console.error('Failed to fetch messages:', e);
    }
  };

  const connectWhatsApp = async () => {
    try {
      setIsProcessing(true);
      await axios.post(`${API_BASE}/whatsapp/connect`);
      setStatus('initializing');
      fetchStatus();
    } catch (e) {
      console.error(e);
      alert('Failed to initialize WhatsApp connection. Make sure WA connector is running.');
    } finally {
      setIsProcessing(false);
    }
  };

  const disconnectWhatsApp = async () => {
    if (!confirm('Disconnect WhatsApp? This will log out the current session so you can link a new WhatsApp.')) return;
    try {
      setIsProcessing(true);
      await axios.post(`${API_BASE}/whatsapp/disconnect`);
      setStatus('disconnected');
      setGroups([]);
      setMonitoredGroup('ALL');
      setQrCode(null);
      alert('WhatsApp disconnected successfully.');
    } catch (e) {
      console.error(e);
      alert('Failed to disconnect');
    } finally {
      setIsProcessing(false);
    }
  };

  const monitorGroup = async (groupId) => {
    try {
      await axios.post(`${API_BASE}/whatsapp/monitor`, { groupId });
      setMonitoredGroup(groupId);
    } catch (e) {
      console.error(e);
    }
  };

  const openReviewModal = (msg) => {
    const analysis = msg.message_analysis?.[0] || {};
    setReviewModalMsg(msg);
    setEditCategory(analysis.category || 'Routine Update');
    setEditSummary(analysis.summary || msg.original_text || '');
  };

  const submitReview = async () => {
    if (!reviewModalMsg) return;
    try {
      await axios.patch(`${API_BASE}/messages/${reviewModalMsg.id}/review`, {
        category: editCategory,
        summary: editSummary,
        extracted_data: reviewModalMsg.message_analysis?.[0]?.extracted_data || {},
        reviewer: 'Human Admin'
      });
      setReviewModalMsg(null);
      fetchMessages();
    } catch (e) {
      alert('Failed to update review');
    }
  };

  const reprocessMessage = async (msgId) => {
    try {
      await axios.post(`${API_BASE}/messages/${msgId}/reprocess`);
      fetchMessages();
    } catch (e) {
      alert('Failed to reprocess message');
    }
  };

  const clearAllMessages = async () => {
    if (!confirm('Are you sure you want to delete all messages?')) return;
    try {
      await axios.delete(`${API_BASE}/messages/cleanup/all`);
      fetchMessages();
    } catch (e) {
      alert('Failed to clear messages');
    }
  };

  // Filter messages based on active tab
  const reviewMessages = messages.filter(m => m.processing_status === 'NEEDS_REVIEW');
  const autoMessages = messages.filter(m => m.processing_status === 'AUTO_ACCEPTED' || m.processing_status === 'APPROVED');
  const displayedMessages = activeTab === 'review' ? reviewMessages : activeTab === 'auto' ? autoMessages : messages;

  const getCategoryBadgeClass = (category) => {
    switch (category) {
      case 'Incident': return 'bg-red-100 text-red-700 border-red-200';
      case 'Change Request': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'Routine Update': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Question': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'Resource Update': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased pb-16">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-6 py-4 shadow-sm">
        <div className="max-w-6xl mx-auto flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Bot size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                WhatsApp Intelligence
              </h1>
              <p className="text-xs text-slate-500">Autonomous Group Monitoring & Classification</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Status Pill */}
            <div className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 border ${
              status === 'connected' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
              status === 'qr_ready' ? 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse' :
              status === 'initializing' || status === 'authenticating' ? 'bg-amber-50 text-amber-700 border-amber-200' :
              'bg-rose-50 text-rose-700 border-rose-200'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                status === 'connected' ? 'bg-emerald-500' :
                status === 'qr_ready' ? 'bg-blue-500' :
                status === 'initializing' || status === 'authenticating' ? 'bg-amber-500' :
                'bg-rose-500'
              }`} />
              {status === 'connected' ? 'CONNECTED' :
               status === 'qr_ready' ? 'READY TO SCAN' :
               status === 'initializing' || status === 'authenticating' ? 'CONNECTING...' :
               'DISCONNECTED'}
            </div>

            {/* Connect / Disconnect Buttons */}
            {status !== 'connected' && (
              <button
                onClick={connectWhatsApp}
                disabled={isProcessing}
                className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
                Connect WhatsApp
              </button>
            )}

            {status === 'connected' && (
              <button
                onClick={disconnectWhatsApp}
                disabled={isProcessing}
                className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-3.5 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <LogOut size={16} /> Disconnect
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 pt-8 space-y-6">
        {/* QR Code Banner if waiting for scan */}
        {qrCode && status !== 'connected' && (
          <div className="bg-white rounded-2xl p-8 border border-blue-100 shadow-md flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold">
                <Sparkles size={14} /> Scan with WhatsApp
              </div>
              <h2 className="text-2xl font-bold text-slate-800">Link WhatsApp Account</h2>
              <ol className="text-sm text-slate-600 space-y-2 list-decimal list-inside">
                <li>Open <strong>WhatsApp</strong> on your phone</li>
                <li>Tap <strong>Settings</strong> or <strong>Menu (⋮)</strong> → <strong>Linked Devices</strong></li>
                <li>Tap <strong>Link a Device</strong> and point your camera at this QR code</li>
              </ol>
            </div>
            <div className="p-3 bg-white border-2 border-dashed border-blue-300 rounded-2xl shadow-inner">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrCode)}`} 
                alt="WhatsApp QR Code"
                className="w-52 h-52 rounded-lg"
              />
            </div>
          </div>
        )}

        {/* Loading state while initializing */}
        {(status === 'initializing' || status === 'authenticating') && !qrCode && (
          <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center shadow-sm">
            <Loader2 size={36} className="mx-auto mb-3 text-blue-600 animate-spin" />
            <h3 className="text-lg font-semibold text-slate-800">Connecting to WhatsApp Browser...</h3>
            <p className="text-sm text-slate-500 mt-1">Starting session. QR code will appear in a moment if needed.</p>
          </div>
        )}

        {/* Group Monitoring Controller */}
        {status === 'connected' && (
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <MessageSquare size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 text-sm">Monitoring Target</h3>
                <p className="text-xs text-slate-500">
                  {monitoredGroup === 'ALL' 
                    ? 'Monitoring all incoming WhatsApp groups' 
                    : `Monitoring: ${groups.find(g => g.id === monitoredGroup)?.name || monitoredGroup}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <select
                className="bg-slate-50 border border-slate-300 rounded-lg px-3.5 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none w-full md:w-64 font-medium"
                value={monitoredGroup}
                onChange={(e) => monitorGroup(e.target.value)}
              >
                <option value="ALL">🌟 All Groups (Auto-Capture All)</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>📁 {g.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Main Feed Header & Tabs */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
            {/* Tabs */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                  activeTab === 'all'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                All Messages ({messages.length})
              </button>

              <button
                onClick={() => setActiveTab('review')}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'review'
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Review Queue
                {reviewMessages.length > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    activeTab === 'review' ? 'bg-white/30 text-white' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {reviewMessages.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('auto')}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                  activeTab === 'auto'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Accepted / Approved ({autoMessages.length})
              </button>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {messages.length > 0 && (
                <button
                  onClick={clearAllMessages}
                  className="text-xs text-slate-400 hover:text-rose-600 px-3 py-1.5 rounded-lg hover:bg-rose-50 flex items-center gap-1 transition-colors cursor-pointer"
                  title="Clear all messages"
                >
                  <Trash2 size={14} /> Clear All
                </button>
              )}
            </div>
          </div>

          {/* Messages Feed */}
          <div className="p-6 space-y-4">
            {displayedMessages.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4 text-slate-400">
                  <MessageSquare size={28} />
                </div>
                <h4 className="text-base font-semibold text-slate-700">No Messages Found</h4>
                <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
                  {status === 'connected'
                    ? 'Send a message in your WhatsApp group to see it appear here in real time with AI classification.'
                    : 'Connect WhatsApp above to start streaming group messages.'}
                </p>
              </div>
            ) : (
              displayedMessages.map((msg) => {
                const analysis = msg.message_analysis?.[0] || null;
                return (
                  <div
                    key={msg.id}
                    className="border border-slate-200/90 rounded-2xl p-5 hover:border-blue-300/80 bg-white transition-all shadow-[0_1px_3px_rgba(0,0,0,0.02)] hover:shadow-md"
                  >
                    {/* Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{msg.sender}</span>
                        <span className="text-xs text-slate-400">in</span>
                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700">
                          {msg.group_name}
                        </span>
                        <span className="text-xs text-slate-400">
                          • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
                          msg.processing_status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                          msg.processing_status === 'AUTO_ACCEPTED' ? 'bg-blue-100 text-blue-800' :
                          msg.processing_status === 'NEEDS_REVIEW' ? 'bg-amber-100 text-amber-800' :
                          msg.processing_status === 'AI_FAILED' ? 'bg-rose-100 text-rose-800' :
                          msg.processing_status === 'PROCESSING' ? 'bg-purple-100 text-purple-800 animate-pulse' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {(msg.processing_status || 'PENDING').replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>

                    {/* Original Message Box */}
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-slate-800 text-sm font-medium whitespace-pre-wrap leading-relaxed mb-4">
                      {msg.original_text || <span className="italic text-slate-400">(No text content)</span>}
                      {msg.media_path && (
                        <div className="mt-3">
                          <img
                            src={`${import.meta.env.VITE_API_BASE?.replace('/api', '') || 'http://localhost:3001'}/${msg.media_path.replace(/\\/g, '/')}`}
                            alt="Media attachment"
                            className="max-h-60 rounded-lg border border-slate-200 object-cover"
                          />
                        </div>
                      )}
                    </div>

                    {/* AI Analysis Card */}
                    {analysis && (
                      <div className="bg-gradient-to-r from-blue-50/60 to-indigo-50/60 border border-blue-100/80 rounded-xl p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-3 py-1 rounded-md font-bold border ${getCategoryBadgeClass(analysis.category)}`}>
                              {analysis.category || 'General'}
                            </span>
                            {analysis.confidence !== null && (
                              <span className="text-xs font-semibold text-slate-500">
                                Confidence: {Math.round((analysis.confidence || 0) * 100)}%
                              </span>
                            )}
                          </div>

                          {analysis.requires_attention && (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                              <ShieldAlert size={13} /> Attention Required
                            </span>
                          )}
                        </div>

                        {/* Summary */}
                        {analysis.summary && (
                          <div className="text-xs text-slate-700">
                            <span className="font-semibold text-slate-500 uppercase tracking-wide">Summary: </span>
                            <span className="font-medium text-slate-900">{analysis.summary}</span>
                          </div>
                        )}

                        {/* Extracted Facts Pills */}
                        {analysis.extracted_data && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {analysis.extracted_data.times?.map((t, i) => (
                              <span key={i} className="text-xs px-2 py-0.5 rounded bg-white text-slate-700 border border-slate-200 flex items-center gap-1">
                                <Clock size={11} className="text-blue-500" /> {t}
                              </span>
                            ))}
                            {analysis.extracted_data.systems?.map((s, i) => (
                              <span key={i} className="text-xs px-2 py-0.5 rounded bg-white text-slate-700 border border-slate-200 flex items-center gap-1">
                                <Layers size={11} className="text-purple-500" /> {s}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Bottom Actions */}
                    <div className="mt-4 flex items-center justify-between pt-2 border-t border-slate-100">
                      <div className="text-xs text-slate-400 font-mono">
                        ID: {msg.whatsapp_message_id?.substring(0, 20)}...
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => reprocessMessage(msg.id)}
                          className="text-xs text-slate-500 hover:text-blue-600 px-3 py-1.5 rounded-lg hover:bg-slate-100 flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <RefreshCcw size={12} /> Reprocess AI
                        </button>

                        {(msg.processing_status === 'NEEDS_REVIEW' || activeTab === 'review') && (
                          <button
                            onClick={() => openReviewModal(msg)}
                            className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <SlidersHorizontal size={13} /> Edit & Approve
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>

      {/* Review & Edit Modal */}
      {reviewModalMsg && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Review & Correct Message</h3>
            
            <div className="bg-slate-50 p-3 rounded-lg text-xs text-slate-700 max-h-32 overflow-y-auto">
              <strong>Original: </strong>{reviewModalMsg.original_text}
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <label className="block font-semibold text-slate-700 text-xs mb-1">Category</label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="Routine Update">Routine Update</option>
                  <option value="Incident">Incident</option>
                  <option value="Change Request">Change Request</option>
                  <option value="Resource Update">Resource Update</option>
                  <option value="Question">Question</option>
                  <option value="Irrelevant">Irrelevant</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 text-xs mb-1">Summary</label>
                <textarea
                  value={editSummary}
                  onChange={(e) => setEditSummary(e.target.value)}
                  rows={3}
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setReviewModalMsg(null)}
                className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={submitReview}
                className="px-4 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-1.5"
              >
                <Check size={16} /> Save & Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
