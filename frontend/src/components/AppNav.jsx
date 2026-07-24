import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Button, Text, Title, Sidebar } from '@nimbus-ds/components';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import BrandSymbol from './BrandSymbol.jsx';
import api from '../services/api.js';

function getYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtu\.be\/([^?]+)/,
    /youtube\.com\/embed\/([^?]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function VideoModal({ url, onClose }) {
  const { t } = useTranslation();
  const youtubeId = getYouTubeId(url);

  // Fecha com Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        backgroundColor: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{ position: 'relative', width: '90%', maxWidth: 720 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Botão fechar */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: -36, right: 0,
            background: 'none', border: 'none', color: '#fff',
            fontSize: 28, lineHeight: 1, cursor: 'pointer',
          }}
          aria-label={t('common.close')}
        >
          ×
        </button>

        {/* Vídeo */}
        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, borderRadius: 8, overflow: 'hidden' }}>
          {youtubeId ? (
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0`}
              title="Vídeo"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
            />
          ) : (
            <video
              src={url}
              autoPlay
              controls
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: '#000' }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function AppNav() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [supportOpen, setSupportOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [supportData, setSupportData] = useState(null);
  const [videoModal, setVideoModal] = useState(null); // url string | null
  const [tickets, setTickets] = useState(null);        // null = não carregado
  const [tSubject, setTSubject] = useState('');
  const [tMessage, setTMessage] = useState('');
  const [tSending, setTSending] = useState(false);
  const [reply, setReply] = useState({});              // { [ticketId]: texto }
  const [replyingId, setReplyingId] = useState(null);
  const [answeredCount, setAnsweredCount] = useState(0); // tickets respondidos (badge)
  const [emailNotifications, setEmailNotifications] = useState(true); // opt-out de e-mail
  const [savingPref, setSavingPref] = useState(false);

  // Resumo de tickets ao montar (badge "respondido" no botão de Suporte).
  useEffect(() => {
    api.get('/api/support/tickets/summary')
      .then((res) => setAnsweredCount(res.data?.answered || 0))
      .catch(() => {});
  }, []);

  // Busca FAQ/config ao abrir; refaz quando o idioma muda (FAQs são por idioma).
  useEffect(() => {
    if (!supportOpen) return;
    api.get('/api/support', { params: { lang: i18n.language } })
      .then((res) => setSupportData(res.data))
      .catch(() => setSupportData({ faqs: [], mainVideoUrl: '', whatsapp: '' }));
  }, [supportOpen, i18n.language]);

  // Carrega os tickets da loja ao abrir o suporte.
  useEffect(() => {
    if (!supportOpen) return;
    loadTickets();
  }, [supportOpen]);

  // Carrega a preferência de e-mail ao abrir o suporte.
  useEffect(() => {
    if (!supportOpen) return;
    api.get('/api/support/preferences')
      .then((res) => setEmailNotifications(res.data?.emailNotifications !== false))
      .catch(() => {});
  }, [supportOpen]);

  const toggleEmailPref = async () => {
    if (savingPref) return;
    const next = !emailNotifications;
    setEmailNotifications(next); // otimista
    setSavingPref(true);
    try {
      await api.put('/api/support/preferences', { emailNotifications: next });
    } catch {
      setEmailNotifications(!next); // reverte em erro
    } finally {
      setSavingPref(false);
    }
  };

  const loadTickets = () => {
    api.get('/api/support/tickets')
      .then((res) => setTickets(res.data.tickets || []))
      .catch(() => setTickets([]));
  };

  const submitTicket = async () => {
    const message = tMessage.trim();
    if (!message || tSending) return;
    setTSending(true);
    try {
      await api.post('/api/support/tickets', { subject: tSubject.trim() || undefined, message });
      setTSubject('');
      setTMessage('');
      loadTickets();
    } catch { /* silencioso */ }
    finally { setTSending(false); }
  };

  const submitReply = async (id) => {
    const message = (reply[id] || '').trim();
    if (!message || replyingId) return;
    setReplyingId(id);
    try {
      await api.post(`/api/support/tickets/${id}/messages`, { message });
      setReply((r) => ({ ...r, [id]: '' }));
      loadTickets();
    } catch { /* silencioso */ }
    finally { setReplyingId(null); }
  };

  const isActive = (path) =>
    path === '/'
      ? location.pathname === '/'
      : location.pathname.startsWith(path);

  const faqs = supportData?.faqs || [];
  const mainVideoUrl = supportData?.mainVideoUrl || '';
  const whatsapp = supportData?.whatsapp || t('support.whatsappNumber', { defaultValue: '' });
  const youtubeId = getYouTubeId(mainVideoUrl);

  return (
    <>
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        padding="4"
        paddingLeft="4"
        paddingRight="4"
        borderColor="neutral-surfaceHighlight"
        borderStyle="solid"
        borderWidth="none"
        borderBottomWidth="1"
        backgroundColor="neutral-background"
      >
        {/* Left nav */}
        <Box display="flex" gap="2" alignItems="center">
          <BrandSymbol height={26} />
          <Button
            appearance={isActive('/') ? 'primary' : 'neutral'}
            onClick={() => navigate('/')}
          >
            {t('nav.dashboard')}
          </Button>
          <Button
            appearance={isActive('/settings') ? 'primary' : 'neutral'}
            onClick={() => navigate('/settings')}
          >
            {t('nav.settings')}
          </Button>
          {/* Adicione aqui os itens de nav específicos do seu app */}
        </Box>

        {/* Right nav */}
        <Box display="flex" gap="3" alignItems="center">
          <Button
            appearance={isActive('/billing') ? 'primary' : 'neutral'}
            onClick={() => navigate('/billing')}
          >
            {t('nav.billing')}
          </Button>
          <Button
            appearance="neutral"
            onClick={() => { setSupportOpen(true); setAnsweredCount(0); }}
          >
            <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {t('nav.support')}
              {answeredCount > 0 && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: 16, height: 16, borderRadius: 8, background: '#e53e3e',
                  color: '#fff', fontSize: 10, fontWeight: 700, lineHeight: 1, padding: '0 4px',
                }}>
                  {answeredCount > 9 ? '9+' : answeredCount}
                </span>
              )}
            </span>
          </Button>
          <LanguageSwitcher />
        </Box>
      </Box>

      {/* Support Sidebar */}
      <Sidebar
        open={supportOpen}
        onRemove={() => setSupportOpen(false)}
      >
        <Box display="flex" flexDirection="column" gap="6" padding="6">
          <Title as="h2">{t('support.title')}</Title>

          {/* WhatsApp */}
          {whatsapp && (
            <Box display="flex" flexDirection="column" gap="2">
              <Button
                appearance="primary"
                as="a"
                href={`https://web.whatsapp.com/send?phone=${whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('support.whatsapp')}
              </Button>
            </Box>
          )}

          {/* Vídeo principal — 16:9 inline, acima do FAQ */}
          <Box display="flex" flexDirection="column" gap="2">
            <Title as="h4">{t('support.videoTitle')}</Title>
            {youtubeId ? (
              <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', height: 0, borderRadius: 8, overflow: 'hidden', background: '#000' }}>
                <iframe
                  src={`https://www.youtube.com/embed/${youtubeId}?rel=0`}
                  title={t('support.videoTitle')}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none', display: 'block' }}
                />
              </div>
            ) : mainVideoUrl ? (
              <Button
                appearance="neutral"
                as="a"
                href={mainVideoUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('support.videoTitle')}
              </Button>
            ) : (
              <Box
                padding="4"
                borderColor="neutral-surfaceHighlight"
                borderStyle="dashed"
                borderWidth="1"
                borderRadius="2"
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                <Text color="neutral-textDisabled">{t('support.videoPlaceholder', { defaultValue: 'Nenhum vídeo configurado' })}</Text>
              </Box>
            )}
          </Box>

          {/* FAQ accordion */}
          {faqs.length > 0 && (
            <Box display="flex" flexDirection="column" gap="2">
              <Title as="h4">{t('support.faqTitle', { defaultValue: 'Dúvidas frequentes' })}</Title>
              <Box display="flex" flexDirection="column" gap="1">
                {faqs.map((item) => {
                  const isOpen = expandedId === item.id;
                  return (
                    <Box
                      key={item.id}
                      borderColor="neutral-surfaceHighlight"
                      borderStyle="solid"
                      borderWidth="1"
                      borderRadius="2"
                      backgroundColor="neutral-background"
                    >
                      <Box
                        display="flex"
                        justifyContent="space-between"
                        alignItems="center"
                        padding="3"
                        style={{ cursor: 'pointer' }}
                        role="button"
                        tabIndex={0}
                        aria-expanded={isOpen}
                        onClick={() => setExpandedId(isOpen ? null : item.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setExpandedId(isOpen ? null : item.id);
                          }
                        }}
                      >
                        <Text fontWeight="bold" fontSize="caption" color="primary-interactive">
                          {item.question}
                        </Text>
                        <Text color="neutral-textLow" fontSize="caption" aria-hidden="true">
                          {isOpen ? '∧' : '∨'}
                        </Text>
                      </Box>
                      {isOpen && (
                        <Box paddingX="3" paddingBottom="3">
                          <Text fontSize="caption" color="neutral-textLow">
                            {item.answer}
                          </Text>
                          {item.videoUrl && (
                            <Box paddingTop="2">
                              <Button
                                appearance="neutral"
                                onClick={() => setVideoModal(item.videoUrl)}
                              >
                                {t('support.viewVideo')}
                              </Button>
                            </Box>
                          )}
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </Box>
            </Box>
          )}

          {/* Tickets — fale com a gente */}
          <Box display="flex" flexDirection="column" gap="3">
            <Title as="h4">{t('support.tickets.title')}</Title>

            {/* Novo ticket */}
            <Box display="flex" flexDirection="column" gap="2">
              <input
                value={tSubject}
                onChange={(e) => setTSubject(e.target.value)}
                placeholder={t('support.tickets.subjectPlaceholder')}
                maxLength={200}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 13, boxSizing: 'border-box' }}
              />
              <textarea
                value={tMessage}
                onChange={(e) => setTMessage(e.target.value)}
                placeholder={t('support.tickets.messagePlaceholder')}
                rows={3}
                maxLength={5000}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
              />
              <Button appearance="primary" disabled={tSending || !tMessage.trim()} onClick={submitTicket}>
                {tSending ? t('support.tickets.sending') : t('support.tickets.send')}
              </Button>
            </Box>

            {/* Minhas conversas */}
            {Array.isArray(tickets) && tickets.length > 0 && (
              <Box display="flex" flexDirection="column" gap="2">
                <Text fontWeight="bold" fontSize="caption">{t('support.tickets.mine')}</Text>
                {tickets.map((tk) => (
                  <Box
                    key={tk.id}
                    borderColor="neutral-surfaceHighlight"
                    borderStyle="solid"
                    borderWidth="1"
                    borderRadius="2"
                    padding="3"
                    display="flex"
                    flexDirection="column"
                    gap="2"
                  >
                    <Box display="flex" justifyContent="space-between" alignItems="center" gap="2">
                      <Text fontWeight="bold" fontSize="caption">{tk.subject || '—'}</Text>
                      <Text fontSize="caption" color="neutral-textLow">{t(`support.tickets.status.${tk.status}`)}</Text>
                    </Box>
                    {(tk.messages || []).map((m) => (
                      <Box
                        key={m.id}
                        backgroundColor={m.author === 'admin' ? 'primary-surface' : 'neutral-surface'}
                        borderRadius="2"
                        padding="2"
                      >
                        <Text fontSize="caption" color="neutral-textLow">
                          {m.author === 'admin' ? t('support.tickets.us') : t('support.tickets.you')}
                        </Text>
                        <Text fontSize="caption" color="neutral-textHigh">{m.body}</Text>
                      </Box>
                    ))}
                    {tk.status !== 'closed' && (
                      <Box display="flex" gap="1">
                        <input
                          value={reply[tk.id] || ''}
                          onChange={(e) => setReply((r) => ({ ...r, [tk.id]: e.target.value }))}
                          placeholder={t('support.tickets.replyPlaceholder')}
                          maxLength={5000}
                          style={{ flex: 1, padding: '6px 8px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 12, boxSizing: 'border-box' }}
                        />
                        <Button
                          appearance="neutral"
                          disabled={replyingId === tk.id || !(reply[tk.id] || '').trim()}
                          onClick={() => submitReply(tk.id)}
                        >
                          {t('support.tickets.reply')}
                        </Button>
                      </Box>
                    )}
                  </Box>
                ))}
              </Box>
            )}

            {/* Preferência de e-mail */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 4 }}>
              <input
                type="checkbox"
                checked={emailNotifications}
                disabled={savingPref}
                onChange={toggleEmailPref}
                style={{ cursor: 'pointer' }}
              />
              <Text fontSize="caption" color="neutral-textLow">{t('support.tickets.emailNotify')}</Text>
            </label>
          </Box>

          {/* Loading state */}
          {supportOpen && !supportData && (
            <Box display="flex" justifyContent="center" padding="4">
              <Text color="neutral-textDisabled">{t('common.loading', { defaultValue: 'Carregando...' })}</Text>
            </Box>
          )}
        </Box>
      </Sidebar>

      {videoModal && (
        <VideoModal url={videoModal} onClose={() => setVideoModal(null)} />
      )}
    </>
  );
}
