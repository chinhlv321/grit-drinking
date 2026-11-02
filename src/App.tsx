import React, { useState, useEffect, useRef } from 'react';
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
  ChevronLeft,
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
  busy_count: number;
  voters: string[];
  busy_voters: string[];
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
  const [voterName, setVoterName] = useState(() => localStorage.getItem('nhau_username') || '');
  const [selectedVotes, setSelectedVotes] = useState<number[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmDateId, setConfirmDateId] = useState<number | null>(null);
  const [confirmingDate, setConfirmingDate] = useState<ProposedDate | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingSessionId, setLoadingSessionId] = useState<number | null>(null);
  const [currentCalendarDate, setCurrentCalendarDate] = useState(new Date());
  const [voteType, setVoteType] = useState<'free' | 'busy'>('free');
  const [nameError, setNameError] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Flag the empty name field and jump to it; returns true when a name is present
  const requireName = () => {
    if (voterName.trim()) return true;
    setNameError(true);
    nameInputRef.current?.focus();
    nameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  };

  useEffect(() => {
    localStorage.setItem('nhau_username', voterName);
  }, [voterName]);

  const getLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  // Names are matched trimmed + case-insensitive, same as the API
  const myName = voterName.trim().toLowerCase();
  const isMe = (v: string) => v.trim().toLowerCase() === myName;

  const formatDate = (d?: string) =>
    d && /^\d{4}-\d{2}-\d{2}$/.test(d)
      ? new Date(d + 'T00:00:00').toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })
      : d || '';

  const fetchSessions = async (openId?: number) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/sessions');
      if (!res.ok) throw new Error('Failed to fetch sessions');
      const data = await res.json();
      setSessions(data);
      if (openId) fetchSessionDetails(openId);
      else if (!selectedSession && data.length > 0) fetchSessionDetails(data[0].id);
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
      if (selectedSession?.id !== id && data.proposed_dates?.length) {
        const first = [...data.proposed_dates].sort((a: ProposedDate, b: ProposedDate) => a.date.localeCompare(b.date))[0];
        setCurrentCalendarDate(new Date(first.date + 'T00:00:00'));
      }
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
        date: getLocalDateString(date),
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
        await fetchSessions(data.id);
      } else {
        alert('Lỗi khi tạo kèo: ' + (data.error || 'Không xác định'));
      }
    } catch (err: any) {
      alert('Lỗi kết nối: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveVote = async (proposedDateId: number) => {
    if (!selectedSession || !voterName.trim()) return;
    
    setIsProcessing(true);
    try {
      const res = await fetch(`/api/sessions/${selectedSession.id}/remove-vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: voterName.trim(),
          proposed_date_id: proposedDateId
        })
      });
      if (res.ok) {
        await fetchSessionDetails(selectedSession.id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVote = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = voterName.trim();
    if (!requireName()) return;
    if (!selectedSession || selectedVotes.length === 0) {
      alert("Vui lòng chọn ít nhất 1 ngày");
      return;
    }
    
    setIsProcessing(true);
    
    // Optimistic Update
    const originalSession = { ...selectedSession };
    const updatedProposedDates = selectedSession.proposed_dates?.map(pd => {
      if (selectedVotes.includes(pd.id)) {
        const isFree = voteType === 'free';
        const voters = pd.voters || [];
        const busy_voters = pd.busy_voters || [];
        const alreadyVotedFree = voters.some(isMe);
        const alreadyVotedBusy = busy_voters.some(isMe);

        if (isFree) {
          if (alreadyVotedFree) return pd;
          return {
            ...pd,
            vote_count: pd.vote_count + 1,
            voters: [...voters, trimmedName],
            busy_count: alreadyVotedBusy ? Math.max(0, pd.busy_count - 1) : pd.busy_count,
            busy_voters: busy_voters.filter(v => !isMe(v))
          };
        } else {
          if (alreadyVotedBusy) return pd;
          return {
            ...pd,
            busy_count: pd.busy_count + 1,
            busy_voters: [...busy_voters, trimmedName],
            vote_count: alreadyVotedFree ? Math.max(0, pd.vote_count - 1) : pd.vote_count,
            voters: voters.filter(v => !isMe(v))
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
        body: JSON.stringify({ name: trimmedName, proposed_date_ids: selectedVotes, vote_type: voteType })
      });
      if (res.ok) {
        await fetchSessionDetails(selectedSession.id);
        setSelectedVotes([]);
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
    const selectedDateObj = selectedSession?.proposed_dates?.find(d => d.id === confirmDateId);
    if (!selectedSession || !selectedDateObj || !confirmPassword) {
      alert("Vui lòng chọn ngày và nhập mật khẩu");
      return;
    }
    
    setIsProcessing(true);
    try {
      const res = await fetch(`/api/sessions/${selectedSession.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          date: selectedDateObj.date, 
          time: selectedDateObj.time,
          password: confirmPassword
        })
      });
      if (res.ok) {
        setConfirmingDate(null);
        setConfirmDateId(null);
        setConfirmPassword('');
        await fetchSessionDetails(selectedSession.id);
        await fetchSessions();
      } else {
        const data = await res.json();
        alert("Lỗi: " + (data.error || "Không thể chốt lịch"));
      }
    } catch (err) {
      console.error(err);
      alert("Lỗi kết nối khi chốt lịch");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearVotes = async () => {
    const nameToClear = voterName.trim();
    if (!selectedSession || !requireName()) return;
    
    if (!confirm(`Bạn có chắc muốn xóa tất cả vote của "${nameToClear}" trong kèo này?`)) return;

    setIsProcessing(true);
    try {
      const res = await fetch(`/api/sessions/${selectedSession.id}/clear-votes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameToClear })
      });
      
      const data = await res.json();

      if (res.ok) {
        await fetchSessionDetails(selectedSession.id);
        setSelectedVotes([]);
        alert(`Đã xóa thành công ${data.deletedCount || 0} vote của "${nameToClear}"`);
      } else {
        alert("Lỗi: " + (data.error || "Không thể hủy vote"));
      }
    } catch (err) {
      console.error('Clear votes error:', err);
      alert("Lỗi kết nối khi hủy vote");
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
        const rest = sessions.filter(x => x.id !== selectedSession.id);
        await fetchSessions(rest[0]?.id);
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
    requireName();
    setSelectedVotes(prev => 
      prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]
    );
  };

  const renderCalendar = () => {
    if (!selectedSession) return null;

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    // Padding for previous month
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(null);
    }
    // Days of current month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }

    const monthName = new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric' }).format(currentCalendarDate);

    return (
      <div className="bg-white rounded-3xl p-2 sm:p-6 border border-black/5 shadow-sm">
        <div className="flex justify-between items-center mb-2 sm:mb-4 px-2 sm:px-0 pt-2 sm:pt-0">
          <h3 className="text-xl sm:text-2xl font-serif font-bold capitalize">{monthName}</h3>
          <div className="flex gap-2">
            <button 
              onClick={() => setCurrentCalendarDate(new Date(year, month - 1, 1))}
              className="p-2 hover:bg-black/5 rounded-full transition-colors border border-black/5"
            >
              <ChevronLeft size={20} />
            </button>
            <button 
              onClick={() => setCurrentCalendarDate(new Date(year, month + 1, 1))}
              className="p-2 hover:bg-black/5 rounded-full transition-colors border border-black/5"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-1 sm:mb-2">
          {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map(day => (
            <div key={day} className="text-center text-xs font-bold text-black/30 uppercase py-2">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {days.map((date, i) => {
            if (!date) return <div key={`empty-${i}`} className="h-16 sm:h-24" />;
            
            const dateStr = getLocalDateString(date);
            const proposedDate = selectedSession.proposed_dates?.find(pd => pd.date === dateStr);
            const isSelected = proposedDate && selectedVotes.includes(proposedDate.id);
            const isToday = getLocalDateString(new Date()) === dateStr;
            
            const iVotedFree = !!myName && !!proposedDate?.voters?.some(isMe);
            const iVotedBusy = !!myName && !!proposedDate?.busy_voters?.some(isMe);
            const iVoted = iVotedFree || iVotedBusy;

            return (
              <div 
                key={dateStr}
                onClick={() => proposedDate && toggleVote(proposedDate.id)}
                className={`
                  h-16 sm:h-24 flex flex-col items-start justify-between p-1.5 sm:p-3 rounded-xl sm:rounded-2xl relative transition-all group select-none hover:z-40
                  ${proposedDate ? 'cursor-pointer' : 'opacity-25 pointer-events-none bg-black/[0.02]'}
                  ${isSelected 
                    ? (voteType === 'free' ? 'bg-[#F27D26] text-white shadow-xl scale-[1.02] z-10' : 'bg-red-500 text-white shadow-xl scale-[1.02] z-10') 
                    : 'bg-white border-2 border-[#F27D26]/25 hover:border-[#F27D26] hover:shadow-md'
                  }
                  ${isToday && !isSelected ? 'ring-4 ring-[#F27D26]/20 border-[#F27D26]' : ''}
                  ${iVoted && !isSelected ? 'ring-2 ring-black/10 bg-black/[0.03] shadow-inner' : ''}
                `}
              >
                {/* Date Number - Top Left */}
                <span className="text-lg sm:text-xl font-serif font-bold relative z-10 leading-none">
                  {date.getDate()}
                </span>

                {/* Individual Delete Button - Top Right (Absolute, smaller & slightly outside day UI) */}
                {iVoted && !isSelected && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      if (proposedDate) handleRemoveVote(proposedDate.id);
                    }}
                    className="hidden sm:block absolute -top-1 -right-1 p-1.5 bg-white text-red-500 border border-red-200 rounded-full transition-all shadow-md z-40 hover:bg-red-500 hover:text-white hover:shadow-lg active:scale-95"
                    title="Hủy vote ngày này"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
                
                {proposedDate && (
                  <>
                    <div className="flex items-center gap-0.5 sm:gap-1 flex-wrap text-[10px] sm:text-[11px] font-bold leading-none">
                      {proposedDate.vote_count > 0 && (
                        <span className={`px-1 sm:px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-white/25' : 'bg-orange-100 text-orange-600'}`}>{proposedDate.vote_count}<span className="hidden sm:inline"> rảnh</span></span>
                      )}
                      {proposedDate.busy_count > 0 && (
                        <span className={`px-1 sm:px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-white/25' : 'bg-red-100 text-red-600'}`}>{proposedDate.busy_count}<span className="hidden sm:inline"> bận</span></span>
                      )}
                      {iVoted && !isSelected && (
                        <span className={`px-1 sm:px-1.5 py-0.5 rounded-full text-white ${iVotedFree ? 'bg-[#F27D26]' : 'bg-red-500'}`}>✓<span className="hidden sm:inline"> bạn</span></span>
                      )}
                    </div>

                    {/* Tooltip for voters (detailed) */}
                    {( (proposedDate.voters && proposedDate.voters.length > 0) || (proposedDate.busy_voters && proposedDate.busy_voters.length > 0) ) && (
                      <div className="hidden md:block absolute top-full left-1/2 -translate-x-1/2 mt-3 w-56 p-5 bg-black text-white text-xs rounded-3xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-2xl">
                        {proposedDate.voters && proposedDate.voters.length > 0 && (
                          <div className="mb-4">
                            <p className="font-bold mb-2 text-orange-400 flex justify-between items-center">
                              <span className="text-[10px] uppercase tracking-wider">Rảnh ({proposedDate.vote_count})</span>
                              {iVotedFree && <span className="text-[9px] bg-orange-400/20 px-2 py-0.5 rounded-full text-orange-400 font-bold">BẠN</span>}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {proposedDate.voters.map((v, idx) => (
                                <span key={idx} className={`px-2.5 py-1 rounded-xl ${isMe(v) ? 'bg-orange-400 text-black font-bold' : 'bg-white/10'}`}>
                                  {v}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {proposedDate.busy_voters && proposedDate.busy_voters.length > 0 && (
                          <div>
                            <p className="font-bold mb-2 text-red-400 flex justify-between items-center">
                              <span className="text-[10px] uppercase tracking-wider">Bận ({proposedDate.busy_count})</span>
                              {iVotedBusy && <span className="text-[9px] bg-red-400/20 px-2 py-0.5 rounded-full text-red-400 font-bold">BẠN</span>}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {proposedDate.busy_voters.map((v, idx) => (
                                <span key={idx} className={`px-2.5 py-1 rounded-xl ${isMe(v) ? 'bg-red-400 text-black font-bold' : 'bg-white/10'}`}>
                                  {v}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-[10px] border-transparent border-b-black" />
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#FDFCFB]">
      {/* Header */}
      <header className="px-4 sm:px-6 lg:px-10 py-5 sm:py-8">
        <div className="flex justify-between items-center gap-3">
          <div>
            <h1 className="text-3xl sm:text-5xl font-serif font-bold tracking-tight text-[#1A1A1A] mb-1 sm:mb-2">
              Nhậu <span className="italic text-[#F27D26]">Chốt</span>
            </h1>
            <p className="text-[10px] sm:text-sm uppercase tracking-[0.2em] font-semibold text-black/40">
              Vote lịch rảnh - Chốt là đi
            </p>
          </div>
          <button 
            onClick={() => setIsAdding(true)}
            className="shrink-0 flex items-center gap-2 bg-[#1A1A1A] text-white px-4 sm:px-6 py-3 rounded-full font-medium hover:bg-black transition-all shadow-lg whitespace-nowrap"
          >
            <Plus size={20} />
            <span className="hidden sm:inline">Tạo kèo mới</span><span className="sm:hidden">Tạo kèo</span>
          </button>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-10 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 xl:gap-8">
          
          {/* List of Sessions */}
          <div className="lg:col-span-3 2xl:col-span-2 min-w-0">
            <h2 className="text-xs font-bold uppercase tracking-widest text-black/30 mb-3">Danh sách kèo</h2>
            <div className="flex lg:flex-col gap-3 overflow-x-auto lg:overflow-visible -mx-4 px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 pb-2 lg:pb-0 [scrollbar-width:none]">
            {isLoading && sessions.length === 0 && (
              <>
                {[1, 2, 3].map(i => (
                  <div key={i} className="shrink-0 w-56 lg:w-auto h-24 bg-black/5 animate-pulse rounded-3xl" />
                ))}
              </>
            )}
            {!isLoading && sessions.length === 0 && (
              <div className="w-full p-12 border-2 border-dashed border-black/5 rounded-3xl text-center">
                <Beer className="mx-auto mb-4 text-black/10" size={48} />
                <p className="text-black/40 font-medium">Chưa có kèo nào. Tạo ngay!</p>
              </div>
            )}
            {sessions.map((session) => (
              <motion.div
                layoutId={`session-${session.id}`}
                key={session.id}
                onClick={() => !loadingSessionId && fetchSessionDetails(session.id)}
                className={`shrink-0 w-56 sm:w-64 lg:w-auto p-4 cursor-pointer transition-all relative ${
                  selectedSession?.id === session.id 
                    ? 'bg-[#1A1A1A] text-white shadow-xl' 
                    : 'bg-white border border-black/5 hover:border-black/20 shadow-sm'
                } ${loadingSessionId === session.id ? 'opacity-50' : ''} rounded-3xl`}
              >
                {loadingSessionId === session.id && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/10 rounded-3xl z-10">
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                <div className="flex justify-between items-start gap-2 mb-2">
                  <h3 className="text-base font-bold leading-snug">{session.title}</h3>
                  <div className={`shrink-0 px-2 py-1 rounded-full text-[10px] font-bold uppercase whitespace-nowrap ${session.status === 'confirmed' ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>
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
                      <span>{formatDate(session.final_date)} {session.final_time}</span>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
            </div>
          </div>

          {/* Details View */}
          <div className="lg:col-span-9 2xl:col-span-10">
            <AnimatePresence mode="wait">
              {selectedSession ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-white border border-black/5 rounded-3xl sm:rounded-[32px] p-3 sm:p-5 lg:p-8 shadow-xl"
                >
                  <div className="flex flex-wrap justify-between items-start gap-3 mb-4 sm:mb-6 px-1 sm:px-0">
                    <div className="min-w-0">
                      <h2 className="text-2xl sm:text-3xl font-serif font-bold mb-4">{selectedSession.title}</h2>
                      <div className="flex flex-wrap gap-2 sm:gap-4">
                        <span className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-full text-sm font-semibold ${selectedSession.status === 'confirmed' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                          {selectedSession.status === 'confirmed' ? <CheckCircle2 size={16} /> : <Users size={16} />}
                          {selectedSession.status === 'confirmed' ? 'Đã chốt lịch' : 'Đang lấy ý kiến'}
                        </span>
                        <span className="flex items-center gap-2 bg-black/5 text-black/60 px-4 py-1.5 rounded-full text-sm font-semibold">
                          <MapPin size={16} /> {selectedSession.location}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {selectedSession.status !== 'confirmed' && (
                        <button 
                          onClick={() => {
                            // Find the date with most votes as default
                            const bestDate = [...(selectedSession.proposed_dates || [])].sort((a, b) => b.vote_count - a.vote_count)[0];
                            setConfirmingDate(bestDate || null);
                            if (bestDate) setConfirmDateId(bestDate.id);
                          }}
                          className="flex items-center gap-2 px-4 sm:px-6 py-3 sm:py-4 bg-emerald-500 text-white rounded-2xl whitespace-nowrap hover:bg-emerald-600 transition-colors shadow-lg font-bold"
                        >
                          <CheckCircle2 size={20} />
                          Chốt kèo
                        </button>
                      )}
                      <button 
                        onClick={() => setIsDeleting(true)}
                        className="p-3 sm:p-4 bg-red-50 text-red-500 rounded-2xl hover:bg-red-100 transition-colors shadow-sm"
                        title="Xóa kèo"
                      >
                        <Trash2 size={22} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-8">
                    {selectedSession.status === 'confirmed' ? (
                      <div className="p-6 sm:p-12 bg-emerald-50 border border-emerald-100 rounded-[40px] text-center shadow-inner">
                        <h3 className="text-emerald-800 font-bold text-2xl mb-4">Kèo đã chốt! 🎉</h3>
                        <p className="text-emerald-600 text-3xl sm:text-5xl font-serif font-bold capitalize">
                          {formatDate(selectedSession.final_date)}
                        </p>
                        {selectedSession.final_time && (
                          <p className="text-emerald-500 text-xl mt-2 font-medium">vào lúc {selectedSession.final_time}</p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {/* Vote bar: name, mode, send — in the order the user acts */}
                        <div className="sticky top-2 z-30 bg-white/90 backdrop-blur border border-black/5 rounded-2xl sm:rounded-3xl p-3 sm:p-4 shadow-md flex flex-wrap items-center gap-2 sm:gap-3">
                          <input
                            ref={nameInputRef}
                            type="text"
                            placeholder="Tên của bạn..."
                            value={voterName}
                            onChange={(e) => { setVoterName(e.target.value); setNameError(false); }}
                            aria-invalid={nameError}
                            className={`flex-1 min-w-[7rem] 2xl:flex-none 2xl:w-56 px-4 py-3 rounded-2xl border outline-none transition-all font-medium ${nameError ? 'bg-red-50 border-red-400 ring-4 ring-red-100 placeholder:text-red-400' : 'bg-black/[0.03] border-black/5 focus:border-[#F27D26]'}`}
                          />
                          <div className="flex p-1 bg-black/[0.04] rounded-2xl shrink-0">
                            <button
                              onClick={() => { setVoteType('free'); setSelectedVotes([]); }}
                              className={`px-3 sm:px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${voteType === 'free' ? 'bg-[#F27D26] text-white shadow' : 'text-black/50 hover:text-black'}`}
                            >
                              Tôi rảnh
                            </button>
                            <button
                              onClick={() => { setVoteType('busy'); setSelectedVotes([]); }}
                              className={`px-3 sm:px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${voteType === 'busy' ? 'bg-red-500 text-white shadow' : 'text-black/50 hover:text-black'}`}
                            >
                              Tôi bận
                            </button>
                          </div>
                          <p role={nameError ? 'alert' : undefined} className={`order-last w-full 2xl:order-none 2xl:w-auto 2xl:flex-1 text-xs sm:text-sm px-1 ${nameError ? 'text-red-500 font-bold' : 'text-black/50'}`}>
                            {nameError
                              ? '⚠ Bạn chưa nhập tên! Nhập tên rồi mới vote được nhé.'
                              : !voterName.trim()
                              ? 'Nhập tên trước nhé.'
                              : selectedVotes.length === 0
                                ? `Bấm vào các ngày bạn ${voteType === 'free' ? 'rảnh' : 'bận'} trên lịch.`
                                : `Đã chọn ${selectedVotes.length} ngày ${voteType === 'free' ? 'rảnh' : 'bận'}.`}
                          </p>
                          <div className="flex gap-2 w-full sm:w-auto sm:ml-auto">
                            <button
                              onClick={handleClearVotes}
                              disabled={isProcessing}
                              className="px-3 sm:px-4 py-3 text-red-500 rounded-2xl text-sm font-bold hover:bg-red-50 transition-all disabled:opacity-40 whitespace-nowrap"
                            >
                              <span className="sm:hidden">Hủy hết</span><span className="hidden sm:inline">Hủy vote của tôi</span>
                            </button>
                            <button
                              onClick={handleVote}
                              disabled={selectedVotes.length === 0 || isProcessing}
                              className={`flex-1 sm:flex-none justify-center px-6 py-3 text-white rounded-2xl font-bold disabled:opacity-40 transition-all flex items-center gap-2 shadow-lg whitespace-nowrap ${voteType === 'free' ? 'bg-[#1A1A1A] hover:bg-black' : 'bg-red-600 hover:bg-red-700'}`}
                            >
                              {isProcessing ? (
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Send size={18} />
                              )}
                              {isProcessing ? 'Đang gửi...' : `Gửi vote (${selectedVotes.length})`}
                            </button>
                          </div>
                        </div>

                        {renderCalendar()}

                          {/* Bảng tổng hợp user đã vote rảnh/bận cho từng ngày/giờ đề xuất */}
                          <div>
                            <h4 className="text-xs font-bold uppercase tracking-widest text-black/30 mb-4">Danh sách người đã vote từng ngày</h4>
                            <div className="overflow-x-auto">
                              <table className="min-w-full border border-black/10 rounded-2xl bg-white">
                                <thead>
                                  <tr className="bg-black/5">
                                    <th className="px-4 py-2 text-left text-xs font-bold uppercase text-black/40">Ngày</th>
                                    <th className="px-4 py-2 text-left text-xs font-bold uppercase text-orange-500">Rảnh</th>
                                    <th className="px-4 py-2 text-left text-xs font-bold uppercase text-red-500">Bận</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {[...(selectedSession.proposed_dates || [])].filter(pd => pd.vote_count + pd.busy_count > 0).sort((a, b) => b.vote_count - a.vote_count || a.busy_count - b.busy_count || a.date.localeCompare(b.date)).map(pd => (
                                    <tr key={pd.id} className="border-t border-black/10">
                                      <td className="px-4 py-2 text-sm font-bold whitespace-nowrap"><span className="capitalize">{formatDate(pd.date)}</span>{pd.time ? ` (${pd.time})` : ''}</td>
                                      <td className="px-4 py-2 text-xs">
                                        {pd.voters && pd.voters.length > 0 ? (
                                          <span>
                                            <span className="font-bold text-orange-500 mr-1">{pd.voters.length}</span>
                                            {pd.voters.map((v, idx) => (
                                              <span key={idx} className="inline-block bg-orange-100 text-orange-700 rounded px-2 py-0.5 mr-1 mb-1">{v}</span>
                                            ))}
                                          </span>
                                        ) : <span className="text-black/30">(không ai)</span>}
                                      </td>
                                      <td className="px-4 py-2 text-xs">
                                        {pd.busy_voters && pd.busy_voters.length > 0 ? (
                                          <span>
                                            <span className="font-bold text-red-500 mr-1">{pd.busy_voters.length}</span>
                                            {pd.busy_voters.map((v, idx) => (
                                              <span key={idx} className="inline-block bg-red-100 text-red-700 rounded px-2 py-0.5 mr-1 mb-1">{v}</span>
                                            ))}
                                          </span>
                                        ) : <span className="text-black/30">(không ai)</span>}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                      </div>
                    )}

                    {selectedSession.description && (
                      <section className="bg-black/5 p-10 rounded-[40px]">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-black/30 mb-4 flex items-center gap-2">
                          <MessageSquare size={16} /> Ghi chú từ chủ xị
                        </h4>
                        <p className="text-xl text-black/80 leading-relaxed italic">"{selectedSession.description}"</p>
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
              className="relative bg-white w-full max-w-lg rounded-[32px] p-6 sm:p-10 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <h2 className="text-2xl sm:text-3xl font-serif font-bold mb-6 sm:mb-8">Lên kèo mới 🍻</h2>
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
                  onKeyDown={(e) => e.key === 'Enter' && handleDeleteSession()}
                  autoFocus
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
              onClick={() => { setConfirmingDate(null); setConfirmDateId(null); }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl"
            >
              <div className="w-16 h-16 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={32} />
              </div>
              <h2 className="text-2xl font-serif font-bold mb-2 text-center">Chốt lịch?</h2>
              <p className="text-black/60 mb-6 text-center text-sm">Chọn ngày cuối cùng để chốt kèo và nhập mật khẩu xác nhận.</p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-black/40 mb-2">Chọn ngày chốt</label>
                  <select 
                    value={confirmDateId || ''}
                    onChange={(e) => setConfirmDateId(Number(e.target.value))}
                    className="w-full px-6 py-4 bg-black/5 rounded-2xl border border-transparent focus:border-emerald-500 focus:bg-white outline-none transition-all text-sm font-bold"
                  >
                    {selectedSession?.proposed_dates?.map(pd => (
                      <option key={pd.id} value={pd.id}>
                        {formatDate(pd.date)} ({pd.vote_count} rảnh, {pd.busy_count} bận)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-black/40 mb-2">Mật khẩu xác nhận</label>
                  <input 
                    type="password" 
                    placeholder="Mật khẩu chốt kèo..."
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                    className="w-full px-6 py-4 bg-black/5 rounded-2xl border border-transparent focus:border-emerald-500 focus:bg-white outline-none transition-all"
                  />
                </div>
                
                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => { setConfirmingDate(null); setConfirmDateId(null); setConfirmPassword(''); }}
                    className="flex-1 px-6 py-3 bg-black/5 text-black font-bold rounded-2xl hover:bg-black/10 transition-all"
                  >
                    Hủy
                  </button>
                  <button 
                    onClick={handleConfirm}
                    disabled={isProcessing || !confirmPassword || !confirmDateId}
                    className="flex-1 px-6 py-3 bg-emerald-500 text-white font-bold rounded-2xl hover:bg-emerald-600 disabled:opacity-50 transition-all shadow-lg flex items-center justify-center gap-2"
                  >
                    {isProcessing && <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    {isProcessing ? 'Đang chốt...' : 'Chốt luôn!'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
