import { useState, useEffect } from 'react';
import adminApi from '../services/adminApi';
import {
  LifeBuoy, Loader2, X, Send, Store, Clock, CheckCircle, Lock, RotateCcw, MessageSquare, BellOff,
} from 'lucide-react';

const TABS = [
  { key: 'all', label: 'Todos' },
  { key: 'open', label: 'Abertos' },
  { key: 'answered', label: 'Respondidos' },
  { key: 'closed', label: 'Fechados' },
];

const statusMeta = {
  open:     { label: 'Aberto',     cls: 'bg-amber-100 text-amber-700' },
  answered: { label: 'Respondido', cls: 'bg-emerald-100 text-emerald-700' },
  closed:   { label: 'Fechado',    cls: 'bg-gray-100 text-gray-600' },
};

function fmt(d) {
  return d ? new Date(d).toLocaleString('pt-BR') : '—';
}

export default function SupportPage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState(null); // ticket detail (com messages)

  useEffect(() => { fetchTickets(); }, [status]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      setError('');
      const params = {};
      if (status !== 'all') params.status = status;
      const res = await adminApi.get('/support', { params });
      setTickets(res.data.data || []);
    } catch {
      setError('Erro ao carregar tickets.');
    } finally {
      setLoading(false);
    }
  };

  const openTicket = async (id) => {
    try {
      const res = await adminApi.get(`/support/${id}`);
      setSelected(res.data.ticket);
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao abrir ticket.');
    }
  };

  const handleReplied = (ticket) => {
    setSelected(ticket);
    fetchTickets();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <LifeBuoy size={22} className="text-blue-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Suporte</h1>
          <p className="text-gray-500 text-sm mt-0.5">Dúvidas e sugestões enviadas pelas lojas</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              status === t.key ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      <div className="space-y-3">
        {tickets.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
            Nenhum ticket encontrado.
          </div>
        ) : (
          tickets.map((tk) => {
            const meta = statusMeta[tk.status] || statusMeta.open;
            return (
              <button
                key={tk.id}
                onClick={() => openTicket(tk.id)}
                className="w-full text-left bg-white rounded-xl shadow-sm p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                      <span className="font-medium text-gray-900 truncate">{tk.subject || '(sem assunto)'}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                      <Store size={12} /> {tk.storeName}
                      <span className="text-gray-300">·</span>
                      <MessageSquare size={12} /> {tk.messageCount}
                      <span className="text-gray-300">·</span>
                      <Clock size={12} /> {fmt(tk.lastMessageAt)}
                    </p>
                    {tk.lastMessage && (
                      <p className="text-sm text-gray-600 mt-1.5 line-clamp-1">
                        {tk.lastMessageAuthor === 'admin' ? 'Você: ' : ''}{tk.lastMessage}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {selected && (
        <TicketModal
          ticket={selected}
          onClose={() => setSelected(null)}
          onChanged={handleReplied}
        />
      )}
    </div>
  );
}

function TicketModal({ ticket, onClose, onChanged }) {
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const meta = statusMeta[ticket.status] || statusMeta.open;

  const sendReply = async () => {
    const message = reply.trim();
    if (!message) return;
    setSending(true);
    try {
      const res = await adminApi.post(`/support/${ticket.id}/reply`, { message });
      setReply('');
      onChanged(res.data.ticket);
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao responder.');
    } finally {
      setSending(false);
    }
  };

  const setStatus = async (status) => {
    setBusy(true);
    try {
      await adminApi.patch(`/support/${ticket.id}/status`, { status });
      const res = await adminApi.get(`/support/${ticket.id}`);
      onChanged(res.data.ticket);
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao atualizar status.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>{meta.label}</span>
              <h2 className="text-base font-bold text-gray-900 truncate">{ticket.subject || '(sem assunto)'}</h2>
            </div>
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
              <Store size={12} /> {ticket.store?.name || `Loja ${ticket.storeId}`}
              {ticket.store?.email && <span>· {ticket.store.email}</span>}
            </p>
            {ticket.store?.emailOptOut && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1.5" title="A loja desativou os e-mails de resposta. Considere outro canal (ex: WhatsApp).">
                <BellOff size={12} /> Esta loja desativou e-mails de resposta — sua resposta não será notificada por e-mail.
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={20} /></button>
        </div>

        {/* Thread */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1 bg-gray-50">
          {(ticket.messages || []).map((m) => {
            const isAdmin = m.author === 'admin';
            return (
              <div key={m.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  isAdmin ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
                }`}>
                  <div className={`text-[10px] mb-0.5 ${isAdmin ? 'text-blue-100' : 'text-gray-400'}`}>
                    {isAdmin ? 'Suporte' : 'Loja'} · {fmt(m.createdAt)}
                  </div>
                  {m.body}
                </div>
              </div>
            );
          })}
        </div>

        {/* Reply + actions */}
        <div className="p-4 border-t border-gray-200 space-y-3">
          {ticket.status !== 'closed' ? (
            <>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={3}
                placeholder="Escreva sua resposta..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setStatus('closed')}
                  disabled={busy}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
                >
                  <Lock size={15} /> Fechar ticket
                </button>
                <button
                  onClick={sendReply}
                  disabled={sending || !reply.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
                >
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  Responder
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm text-gray-500">
                <CheckCircle size={15} className="text-gray-400" /> Ticket fechado
              </span>
              <button
                onClick={() => setStatus('open')}
                disabled={busy}
                className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <RotateCcw size={15} /> Reabrir
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
