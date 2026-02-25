import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Beer, 
  Calendar, 
  MapPin, 
  Clock, 
  Plus, 
  Users, 
  Send, 
  CheckCircle2, 
  XCircle, 
  ChevronRight,
  MessageSquare,
  Trash2
} from 'lucide-react';

interface Participant {
  id: number;
  name: string;
  status: 'confirmed' | 'declined' | 'pending';
}

interface ProposedDate {
  id: number;
  date: string;
  time: string;
  vote_count: number;
  voters: string[];
}

interface Session {
  id: number;
  title: string;
  location: string;
  description: string;
  discord_webhook: string;
  status: 'voting' | 'confirmed';
  final_date?: string;
  final_time?: string;
  proposed_dates?: ProposedDate[];
  participants?: Participant[];
}

export default function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newSession, setNewSession] = useState({
    title: '',
    location: '',
    description: '',
    discord_webhook: '',
    proposed_dates: [{ date: '', time: '' }]
  });
  const [voterName, setVoterName] = useState('');
  const [selectedVotes, setSelectedVotes] = useState<number[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [confirmingDate, setConfirmingDate] = useState<ProposedDate | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingSessionId, setLoadingSessionId] = useState<number | null>(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/sessions');
      if (!res.ok) throw new Error('Failed to fetch sessions');
      const data = await res.json();
      setSessions(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSessionDetails = async (id: number) => {
    setLoadingSessionId(id);
    try {
      const res = await fetch(`/api/sessions/${id}`);
      if (!res.ok) throw new Error('Failed to fetch session details');
      const data = await res.json();
      setSelectedSession(data);
      setSelectedVotes([]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSessionId(null);
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    
    // Auto-generate 30 days starting from today
    const proposed_dates = [];
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      proposed_dates.push({
        date: date.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' }),
        time: ''
      });
    }

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newSession,
          proposed_dates
        })
      });
      
      const text = await res.text();
      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch (e) {
        throw new Error('Server returned invalid response');
      }

      if (res.ok) {
        setIsAdding(false);
        setNewSession({ 
          title: '', 
          location: '', 
          description: '', 
          discord_webhook: '', 
          proposed_dates: [] 
        });
        await fetchSessions();
      } else {
        alert('Lỗi khi tạo kèo: ' + (data.error || 'Không xác định'));
      }
    } catch (err: any) {
      alert('Lỗi kết nối: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSession || !voterName || selectedVotes.length === 0) return;
    
    setIsProcessing(true);
    
    // Optimistic Update
    const originalSession = { ...selectedSession };
    const updatedProposedDates = selectedSession.proposed_dates?.map(pd => {
      if (selectedVotes.includes(pd.id)) {
        const alreadyVoted = pd.voters.includes(voterName);
        if (!alreadyVoted) {
          return {
            ...pd,
            vote_count: pd.vote_count + 1,
            voters: [...pd.voters, voterName]
          };
        }
      } else {
        // If they were in voters but now unselected (though UI doesn't allow unvoting in this simple way yet)
        const wasVoter = pd.voters.includes(voterName);
        if (wasVoter) {
          return {
            ...pd,
            vote_count: Math.max(0, pd.vote_count - 1),
            voters: pd.voters.filter(v => v !== voterName)
          };
        }
      }
      return pd;
    });
    
    setSelectedSession({
      ...selectedSession,
      proposed_dates: updatedProposedDates
    });

    try {
      const res = await fetch(`/api/sessions/${selectedSession.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: voterName, proposed_date_ids: selectedVotes })
      });
      if (res.ok) {
        await fetchSessionDetails(selectedSession.id);
      } else {
        setSelectedSession(originalSession);
        alert("Lỗi khi gửi vote");
      }
    } catch (err) {
      setSelectedSession(originalSession);
      alert("Lỗi kết nối");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirm = async () => {
    if (!selectedSession || !confirmingDate) return;
    setIsProcessing(true);
    try {
      const res = await fetch(`/api/sessions/${selectedSession.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: confirmingDate.date, time: confirmingDate.time })
      });
      if (res.ok) {
        setConfirmingDate(null);
        await fetchSessionDetails(selectedSession.id);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteSession = async () => {
    if (!selectedSession || !deletePassword) return;

    setIsProcessing(true);
    try {
      const res = await fetch(`/api/sessions/${selectedSession.id}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword })
      });

      if (res.ok) {
        setIsDeleting(false);
        setDeletePassword('');
        setSelectedSession(null);
        await fetchSessions();
      } else {
        const data = await res.json();
        alert("Lỗi: " + (data.error || "Không thể xóa kèo"));
      }
    } catch (err) {
      alert("Lỗi kết nối khi xóa kèo");
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleVote = (id: number) => {
    setSelectedVotes(prev => 
      prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]
    );
  };

  return (
    <div className="min-h-screen bg-[#FDFCFB]">
      {/* Header */}
      <header className="px-6 py-12 max-w-5xl mx-auto">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-6xl font-serif font-bold tracking-tight text-[#1A1A1A] mb-2">
              Nhậu <span className="italic text-[#F27D26]">Chốt</span>
            </h1>
            <p className="text-sm uppercase tracking-[0.2em] font-semibold text-black/40">
              Vote lịch rảnh - Chốt là đi
            </p>
          </div>
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 bg-[#1A1A1A] text-white px-6 py-3 rounded-full font-medium hover:bg-black transition-all shadow-lg"
          >
            <Plus size={20} />
            Tạo kèo mới
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* List of Sessions */}
          <div className="lg:col-span-4 space-y-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-black/30 mb-4">Danh sách kèo</h2>
            {isLoading && sessions.length === 0 && (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-32 bg-black/5 animate-pulse rounded-3xl" />
                ))}
              </div>
            )}
            {!isLoading && sessions.length === 0 && (
              <div className="p-12 border-2 border-dashed border-black/5 rounded-3xl text-center">
                <Beer className="mx-auto mb-4 text-black/10" size={48} />
                <p className="text-black/40 font-medium">Chưa có kèo nào. Tạo ngay!</p>
              </div>
            )}
            {sessions.map((session) => (
              <motion.div
                layoutId={`session-${session.id}`}
                key={session.id}
                onClick={() => !loadingSessionId && fetchSessionDetails(session.id)}
                className={`p-6 cursor-pointer transition-all relative ${
                  selectedSession?.id === session.id 
                    ? 'bg-[#1A1A1A] text-white shadow-2xl scale-[1.02]' 
                    : 'bg-white border border-black/5 hover:border-black/20 shadow-sm'
                } ${loadingSessionId === session.id ? 'opacity-50' : ''} rounded-3xl`}
              >
                {loadingSessionId === session.id && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/10 rounded-3xl z-10">
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-xl font-bold">{session.title}</h3>
                  <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${session.status === 'confirmed' ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>
                    {session.status === 'confirmed' ? 'Đã chốt' : 'Đang vote'}
                  </div>
                </div>
                <div className="space-y-2 text-sm opacity-70">
                  <div className="flex items-center gap-2">
                    <MapPin size={14} />
                    <span className="truncate">{session.location}</span>
                  </div>
                  {session.status === 'confirmed' && (
                    <div className="flex items-center gap-2 text-emerald-400 font-bold">
                      <Calendar size={14} />
                      <span>{session.final_date} {session.final_time}</span>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Details View */}
          <div className="lg:col-span-8">
            <AnimatePresence mode="wait">
              {selectedSession ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-white border border-black/5 rounded-[40px] p-8 lg:p-12 shadow-xl sticky top-8"
                >
                  <div className="flex justify-between items-start mb-8">
                    <div>
                      <h2 className="text-4xl font-serif font-bold mb-4">{selectedSession.title}</h2>
                      <div className="flex flex-wrap gap-4">
                        <span className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold ${selectedSession.status === 'confirmed' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                          {selectedSession.status === 'confirmed' ? <CheckCircle2 size={16} /> : <Users size={16} />}
                          {selectedSession.status === 'confirmed' ? 'Đã chốt lịch' : 'Đang lấy ý kiến'}
                        </span>
                        <span className="flex items-center gap-2 bg-black/5 text-black/60 px-4 py-1.5 rounded-full text-sm font-semibold">
                          <MapPin size={16} /> {selectedSession.location}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setIsDeleting(true)}
                        className="p-4 bg-red-50 text-red-500 rounded-2xl hover:bg-red-100 transition-colors shadow-sm"
                        title="Xóa kèo"
                      >
                        <Trash2 size={24} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-10">
                    {selectedSession.status === 'confirmed' ? (
                      <div className="p-8 bg-emerald-50 border border-emerald-100 rounded-3xl text-center">
                        <h3 className="text-emerald-800 font-bold text-xl mb-2">Lịch đã chốt!</h3>
                        <p className="text-emerald-600 text-3xl font-serif font-bold">
                          {selectedSession.final_date}
                        </p>
                      </div>
                    ) : (
                      <section className="flex flex-col max-h-[800px]">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-black/30 mb-4">Bình chọn lịch rảnh</h4>
                        
                        <form onSubmit={handleVote} className="flex gap-3 bg-black/5 p-4 rounded-[32px] mb-6 shrink-0">
                          <input 
                            required
                            type="text" 
                            placeholder="Nhập tên bạn để vote..." 
                            value={voterName}
                            onChange={(e) => setVoterName(e.target.value)}
                            className="flex-1 px-6 py-3 bg-white rounded-2xl border border-black/5 outline-none focus:border-[#F27D26]"
                          />
                          <button 
                            type="submit" 
                            disabled={selectedVotes.length === 0 || !voterName.trim() || isProcessing}
                            className="px-8 py-3 bg-[#1A1A1A] text-white rounded-2xl font-bold hover:bg-black disabled:opacity-50 transition-all flex items-center gap-2 whitespace-nowrap"
                          >
                            {isProcessing ? (
                              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Send size={18} />
                            )}
                            {isProcessing ? 'Đang gửi...' : `Gửi Vote (${selectedVotes.length})`}
                          </button>
                        </form>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto pr-2 pb-4">
                          {selectedSession.proposed_dates?.map((pd) => (
                            <div 
                              key={pd.id}
                              onClick={() => toggleVote(pd.id)}
                              className={`p-6 rounded-3xl border-2 transition-all cursor-pointer relative ${
                                selectedVotes.includes(pd.id) 
                                  ? 'border-[#F27D26] bg-[#F27D26]/5' 
                                  : 'border-black/5 hover:border-black/20'
                              }`}
                            >
                              <div className="flex justify-between items-center mb-4">
                                <div>
                                  <span className="font-bold text-lg block">{pd.date}</span>
                                </div>
                                <span className="text-xs font-bold px-3 py-1 bg-black/5 rounded-full text-black/60">
                                  {pd.vote_count} votes
                                </span>
                              </div>
                              
                              <div className="pt-4 border-t border-black/5">
                                <p className="text-[10px] font-bold uppercase text-black/30 mb-2">Người đã vote:</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {pd.voters && pd.voters.length > 0 ? pd.voters.map((voter, i) => (
                                    <span key={i} className="px-2.5 py-1 bg-white border border-black/10 rounded-md text-xs font-medium shadow-sm">
                                      {voter}
                                    </span>
                                  )) : (
                                    <span className="text-xs text-black/20 italic">Chưa có ai</span>
                                  )}
                                </div>
                              </div>
                              
                              <button 
                                onClick={(e) => { e.stopPropagation(); setConfirmingDate(pd); }}
                                className="absolute top-4 right-4 p-2 bg-emerald-500 text-white rounded-xl opacity-0 hover:opacity-100 transition-opacity shadow-lg"
                                title="Chốt lịch này"
                              >
                                <CheckCircle2 size={16} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {selectedSession.description && (
                      <section>
                        <h4 className="text-xs font-bold uppercase tracking-widest text-black/30 mb-3">Ghi chú</h4>
                        <p className="text-black/60 leading-relaxed">{selectedSession.description}</p>
                      </section>
                    )}
                  </div>
                </motion.div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center p-12 text-center text-black/20">
                  <Beer size={80} strokeWidth={1} className="mb-6" />
                  <p className="text-xl font-serif italic">Chọn một kèo để xem chi tiết</p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdding(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-lg rounded-[40px] p-10 shadow-2xl"
            >
              <h2 className="text-3xl font-serif font-bold mb-8">Lên kèo mới 🍻</h2>
              <form onSubmit={handleCreateSession} className="space-y-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-black/40 mb-2">Tên kèo</label>
                  <input 
                    required
                    type="text" 
                    placeholder="Ví dụ: Nhậu tất niên, Bia hơi vỉa hè..."
                    value={newSession.title}
                    onChange={(e) => setNewSession({...newSession, title: e.target.value})}
                    className="w-full px-6 py-4 bg-black/5 rounded-2xl border border-transparent focus:border-black/10 focus:bg-white outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-black/40 mb-2">Địa điểm</label>
                  <input 
                    required
                    type="text" 
                    placeholder="Quán nhậu ABC, Nhà thằng Tèo..."
                    value={newSession.location}
                    onChange={(e) => setNewSession({...newSession, location: e.target.value})}
                    className="w-full px-6 py-4 bg-black/5 rounded-2xl border border-transparent focus:border-black/10 focus:bg-white outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-black/40 mb-2">Ghi chú (Tùy chọn)</label>
                  <textarea 
                    placeholder="Anh em nhớ mang theo tâm hồn đẹp..."
                    value={newSession.description}
                    onChange={(e) => setNewSession({...newSession, description: e.target.value})}
                    className="w-full px-6 py-4 bg-black/5 rounded-2xl border border-transparent focus:border-black/10 focus:bg-white outline-none transition-all h-24 resize-none"
                  />
                </div>

                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                  <p className="text-xs text-amber-700 font-medium">
                    ✨ Hệ thống sẽ tự động tạo danh sách vote cho 30 ngày tới.
                  </p>
                </div>

                <div className="pt-4 flex gap-4">
                  <button 
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="flex-1 px-8 py-4 bg-black/5 text-black font-bold rounded-2xl hover:bg-black/10 transition-all"
                  >
                    Hủy
                  </button>
                  <button 
                    type="submit"
                    disabled={isProcessing}
                    className="flex-[2] px-8 py-4 bg-[#1A1A1A] text-white font-bold rounded-2xl hover:bg-black disabled:opacity-50 transition-all shadow-xl flex items-center justify-center gap-2"
                  >
                    {isProcessing && <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    {isProcessing ? 'Đang tạo...' : 'Tạo kèo & Vote!'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {isDeleting && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDeleting(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl"
            >
              <h2 className="text-2xl font-serif font-bold mb-2 text-red-500">Xóa kèo?</h2>
              <p className="text-black/60 mb-6">Hành động này không thể hoàn tác. Vui lòng nhập mật khẩu để xác nhận.</p>
              <div className="space-y-4">
                <input 
                  type="password" 
                  placeholder="Mật khẩu..."
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  className="w-full px-6 py-4 bg-black/5 rounded-2xl border border-transparent focus:border-red-500 focus:bg-white outline-none transition-all"
                />
                <div className="flex gap-3">
                  <button 
                    onClick={() => setIsDeleting(false)}
                    className="flex-1 px-6 py-3 bg-black/5 text-black font-bold rounded-2xl hover:bg-black/10 transition-all"
                  >
                    Hủy
                  </button>
                  <button 
                    onClick={handleDeleteSession}
                    disabled={!deletePassword || isProcessing}
                    className="flex-1 px-6 py-3 bg-red-500 text-white font-bold rounded-2xl hover:bg-red-600 disabled:opacity-50 transition-all shadow-lg flex items-center justify-center gap-2"
                  >
                    {isProcessing && <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    {isProcessing ? 'Đang xóa...' : 'Xóa'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {confirmingDate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmingDate(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={32} />
              </div>
              <h2 className="text-2xl font-serif font-bold mb-2">Chốt lịch?</h2>
              <p className="text-black/60 mb-8">Bạn có chắc chắn muốn chốt kèo vào ngày <strong className="text-black">{confirmingDate.date}</strong>?</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setConfirmingDate(null)}
                  className="flex-1 px-6 py-3 bg-black/5 text-black font-bold rounded-2xl hover:bg-black/10 transition-all"
                >
                  Hủy
                </button>
                <button 
                  onClick={handleConfirm}
                  disabled={isProcessing}
                  className="flex-1 px-6 py-3 bg-emerald-500 text-white font-bold rounded-2xl hover:bg-emerald-600 disabled:opacity-50 transition-all shadow-lg flex items-center justify-center gap-2"
                >
                  {isProcessing && <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {isProcessing ? 'Đang chốt...' : 'Chốt luôn!'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
