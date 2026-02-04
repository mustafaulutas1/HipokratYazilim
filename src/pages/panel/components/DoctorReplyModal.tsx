import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { useAuth } from '../../../context/AuthContext';

interface DoctorMessage {
  id: string;
  fromUserId: string;
  fromUserName: string;
  fromUserRole: string;
  toUserId: string;
  toDoctorName: string;
  message: string;
  messageType: 'info' | 'urgent' | 'question';
  patientId?: string;
  patientName?: string;
  clinicId: string;
  isRead: boolean;
  createdAt: string;
  timestamp: any;
  reply?: string;
  replyAt?: string;
  repliedBy?: string;
  repliedByName?: string;
}

interface DoctorReplyModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: DoctorMessage | null;
  doctorProfile?: any;
}

const DoctorReplyModal: React.FC<DoctorReplyModalProps> = ({
  isOpen,
  onClose,
  message,
  doctorProfile
}) => {
  const { user } = useAuth();
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [sentReply, setSentReply] = useState<{ text: string; sentAt: string } | null>(null);

  const getMessageTypeColor = (type: string) => {
    switch (type) {
      case 'urgent': return 'bg-red-100 text-red-700 border-red-200';
      case 'question': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-green-100 text-green-700 border-green-200';
    }
  };

  const getMessageTypeLabel = (type: string) => {
    switch (type) {
      case 'urgent': return 'Acil';
      case 'question': return 'Soru';
      default: return 'Bilgi';
    }
  };

  const formatMessageDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleSendReply = async () => {
    if (!reply.trim() || !message || !user) return;
    
    try {
      setSending(true);
      
      const replyText = reply.trim();
      const replyTime = new Date().toISOString();
      
      const messageRef = doc(db, 'doctorMessages', message.id);
      await updateDoc(messageRef, {
        reply: replyText,
        replyAt: replyTime,
        repliedBy: user.uid,
        repliedByName: doctorProfile?.fullName || doctorProfile?.name || 'Doktor',
        isRead: true,
        readAt: new Date().toISOString()
      });
      
      console.log('✅ Reply sent successfully');
      
      // Store the sent reply locally to show it in the modal
      setSentReply({ text: replyText, sentAt: replyTime });
      setReply('');
      
    } catch (error) {
      console.error('❌ Error sending reply:', error);
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setReply('');
    setSentReply(null);
    onClose();
  };

  // Get the current reply to display (either from the message or from local state after sending)
  const currentReply = sentReply ? sentReply.text : message?.reply;
  const currentReplyAt = sentReply ? sentReply.sentAt : message?.replyAt;

  if (!isOpen || !message) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-2xl mx-4 overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3">
            <span className="text-3xl">💬</span>
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Mesaj Detayı</h2>
              <p className="text-gray-600">Asistan mesajına yanıt verin</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-200 rounded-lg text-gray-500 hover:text-gray-700 transition-all duration-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Original Message Info */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">👨‍💼</span>
                <span className="text-gray-800 font-medium">{message.fromUserName}</span>
                <span className={`text-xs px-2 py-1 rounded-full border ${getMessageTypeColor(message.messageType)}`}>
                  {getMessageTypeLabel(message.messageType)}
                </span>
              </div>
              <span className="text-gray-500 text-xs">
                {formatMessageDate(message.createdAt)}
              </span>
            </div>

            {message.patientName && (
              <div className="mb-3 p-2 bg-blue-50 border border-blue-100 rounded-lg">
                <div className="flex items-center gap-2 text-blue-700">
                  <span className="text-sm">👤</span>
                  <span className="text-sm font-medium">Hasta: {message.patientName}</span>
                </div>
              </div>
            )}

            <p className="text-gray-700 leading-relaxed">
              {message.message}
            </p>
          </div>

          {/* Previous Reply (if exists) */}
          {currentReply && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">✅</span>
                <span className="text-green-800 font-medium">Yanıtınız</span>
                <span className="text-green-600 text-xs">
                  {currentReplyAt ? formatMessageDate(currentReplyAt) : ''}
                </span>
                {sentReply && (
                  <span className="text-xs bg-green-500 text-white px-2 py-1 rounded-full ml-2">
                    Gönderildi ✓
                  </span>
                )}
              </div>
              <p className="text-green-700 leading-relaxed">
                {currentReply}
              </p>
            </div>
          )}

          {/* Reply Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {currentReply ? 'Yanıtı Güncelle' : 'Yanıtınız'} *
            </label>
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={6}
              className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-800 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 resize-none"
              placeholder={currentReply ? "Yanıtınızı güncellemek için yeni mesajınızı yazın..." : "Asistana yanıtınızı yazın..."}
              required
            />
            <div className="mt-2 text-sm text-gray-500">
              {reply.length}/500 karakter
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={handleClose}
            className="px-6 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg transition-all duration-200"
            disabled={sending}
          >
            {sentReply ? 'Kapat' : 'İptal'}
          </button>
          <button
            onClick={handleSendReply}
            disabled={!reply.trim() || sending}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {sending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Gönderiliyor...
              </>
            ) : (
              <>
                <span>📤</span>
                {currentReply ? 'Yanıtı Güncelle' : 'Yanıt Gönder'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DoctorReplyModal;
