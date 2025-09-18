import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { useAuth } from '../../../context/AuthContext';

interface Doctor {
  id: string;
  name: string;
  email: string;
  specialization?: string;
  department?: string;
  clinicId?: string;
  role?: string;
}

interface DoctorMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId?: string;
  patientName?: string;
  doctorProfile?: any;
}

const DoctorMessageModal: React.FC<DoctorMessageModalProps> = ({
  isOpen,
  onClose,
  patientId,
  patientName,
  doctorProfile
}) => {
  const { user } = useAuth();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'info' | 'urgent' | 'question'>('info');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchDoctors();
    }
  }, [isOpen]);

  const fetchDoctors = async () => {
    try {
      setLoading(true);
      console.log('🔍 Fetching all doctors...');
      
      // Try different collection names and combine all users
      const collectionNames = ['users', 'doctors', 'Users', 'Doctors', 'clinicUsers'];
      let allUsers: any[] = [];
      
      for (const collectionName of collectionNames) {
        try {
          console.log(`🔍 Trying collection: ${collectionName}`);
          const usersQuery = collection(db, collectionName);
          const usersSnapshot = await getDocs(usersQuery);
          const users = usersSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          
          console.log(`📊 Collection ${collectionName}: ${users.length} documents`);
          if (users.length > 0) {
            console.log(`📋 Sample data from ${collectionName}:`, users[0]);
            // Combine all users from all collections
            allUsers = [...allUsers, ...users];
          }
        } catch (err) {
          console.log(`❌ Collection ${collectionName} not accessible:`, err);
        }
      }
      
      console.log('👥 Total users found:', allUsers.length);
      
      if (allUsers.length === 0) {
        console.log('🧪 No users found in any collection, using test doctors');
        const testDoctors = [
          { id: 'test1', name: 'Dr. Ahmet Yılmaz', email: 'ahmet@clinic.com', role: 'doctor', specialization: 'Kardiyoloji' },
          { id: 'test2', name: 'Dr. Ayşe Demir', email: 'ayse@clinic.com', role: 'doctor', specialization: 'Nöroloji' },
          { id: 'test3', name: 'Dr. Mehmet Kaya', email: 'mehmet@clinic.com', role: 'doctor', specialization: 'Ortopedi' }
        ] as Doctor[];
        
        setDoctors(testDoctors);
        return;
      }
      
      // Filter for doctors - prioritize role=doctor from clinic users
      const doctorUsers = allUsers.filter((user: any) => {
        console.log(`User ${user.id}: role=${user.role}, isClinicOwner=${user.isClinicOwner}, department=${user.department}, name=${user.name || user.firstName || user.displayName}`);
        // Primary: Check if role is explicitly 'doctor'
        if (user.role === 'doctor') {
          console.log(`✅ Found doctor by role: ${user.name || user.firstName || user.displayName}`);
          return true;
        }
        // Secondary: Check other doctor indicators
        if (user.userType === 'doctor' || 
            user.type === 'doctor' ||
            user.isClinicOwner === true ||
            user.department ||
            user.specialization ||
            user.hospital) {
          console.log(`✅ Found doctor by other fields: ${user.name || user.firstName || user.displayName}`);
          return true;
        }
        return false;
      }) as Doctor[];
      
      console.log('👨‍⚕️ Found doctors:', doctorUsers.length);
      
      if (doctorUsers.length === 0) {
        console.log('🧪 No doctors found, using test doctors');
        const testDoctors = [
          { id: 'test1', name: 'Dr. Ahmet Yılmaz', email: 'ahmet@clinic.com', role: 'doctor', specialization: 'Kardiyoloji' },
          { id: 'test2', name: 'Dr. Ayşe Demir', email: 'ayse@clinic.com', role: 'doctor', specialization: 'Nöroloji' },
          { id: 'test3', name: 'Dr. Mehmet Kaya', email: 'mehmet@clinic.com', role: 'doctor', specialization: 'Ortopedi' }
        ] as Doctor[];
        
        setDoctors(testDoctors);
      } else {
        // Ensure we have proper name mapping for doctors
        const mappedDoctors = doctorUsers.map((doctor: any) => {
          console.log(`🔍 Doctor data for ${doctor.id}:`, doctor);
          
          // Check all possible name fields
          let displayName = doctor.name || 
                           doctor.firstName || 
                           doctor.displayName || 
                           doctor.fullName ||
                           doctor.userName || 
                           doctor.username || 
                           doctor.title;
          
          // If no name fields, try to construct from firstName + lastName
          if (!displayName && (doctor.firstName || doctor.lastName)) {
            displayName = `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim();
          }
          
          // If still no name, create a meaningful name from email
          if (!displayName && doctor.email) {
            const emailParts = doctor.email.split('@')[0].split('.');
            if (emailParts.length >= 2) {
              // e.turanemre@gmail.com -> E. Turanemre
              const firstName = emailParts[0].charAt(0).toUpperCase() + '.';
              const lastName = emailParts[1].charAt(0).toUpperCase() + emailParts[1].slice(1);
              displayName = `Dr. ${firstName} ${lastName}`;
            } else {
              // single name in email
              const emailName = emailParts[0];
              displayName = `Dr. ${emailName.charAt(0).toUpperCase() + emailName.slice(1)}`;
            }
          }
          
          // Last resort - use ID
          if (!displayName) {
            displayName = `Dr. ${doctor.id.slice(0, 8)}`;
          }
          
          console.log(`👨‍⚕️ Final display name for ${doctor.id}: ${displayName}`);
          
          return {
            ...doctor,
            name: displayName
          };
        });
        
        setDoctors(mappedDoctors);
      }
      
    } catch (error) {
      console.error('❌ Error fetching doctors:', error);
      console.log('🧪 Using test doctors due to error');
      const testDoctors = [
        { id: 'test1', name: 'Dr. Ahmet Yılmaz', email: 'ahmet@clinic.com', role: 'doctor', specialization: 'Kardiyoloji' },
        { id: 'test2', name: 'Dr. Ayşe Demir', email: 'ayse@clinic.com', role: 'doctor', specialization: 'Nöroloji' },
        { id: 'test3', name: 'Dr. Mehmet Kaya', email: 'mehmet@clinic.com', role: 'doctor', specialization: 'Ortopedi' }
      ] as Doctor[];
      
      setDoctors(testDoctors);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedDoctorId || !message.trim() || !user || !doctorProfile) return;
    
    try {
      setSending(true);
      
      const selectedDoctor = doctors.find(d => d.id === selectedDoctorId);
      
      const messageData = {
        fromUserId: user.uid,
        fromUserName: doctorProfile.name || user.email,
        fromUserRole: 'assistant',
        toUserId: selectedDoctorId,
        toDoctorName: selectedDoctor?.name || 'Doktor',
        message: message.trim(),
        messageType,
        patientId: patientId || null,
        patientName: patientName || null,
        clinicId: doctorProfile.clinicId,
        isRead: false,
        createdAt: new Date().toISOString(),
        timestamp: new Date()
      };
      
      await addDoc(collection(db, 'doctorMessages'), messageData);
      
      // Reset form
      setMessage('');
      setSelectedDoctorId('');
      setMessageType('info');
      onClose();
      
      // Show success message (you could add a toast notification here)
      console.log('✅ Message sent successfully');
      
    } catch (error) {
      console.error('❌ Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-2xl mx-4 overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3">
            <span className="text-3xl">👨‍⚕️</span>
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Doktora Mesaj Gönder</h2>
              <p className="text-gray-600">
                {patientName ? `${patientName} hakkında mesaj gönder` : 'Doktora bilgi mesajı gönder'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-lg text-gray-500 hover:text-gray-700 transition-all duration-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Doctor Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mesaj Gönderilecek Doktor *
            </label>
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                <span className="ml-2 text-gray-600">Doktorlar yükleniyor...</span>
              </div>
            ) : (
              <div>
                <div className="mb-2 text-xs text-gray-500">
                  Bulunan doktor sayısı: {doctors.length}
                </div>
                <select
                  value={selectedDoctorId}
                  onChange={(e) => setSelectedDoctorId(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  required
                >
                  <option value="">Doktor seçin...</option>
                  {doctors.length > 0 ? doctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>
                      {doctor.name || `Doktor ${doctor.id.slice(0, 8)}`} {doctor.specialization || doctor.department ? `- ${doctor.specialization || doctor.department}` : ''}
                    </option>
                  )) : (
                    <option value="" disabled>Doktor bulunamadı</option>
                  )}
                </select>
              </div>
            )}
          </div>

          {/* Message Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mesaj Türü
            </label>
            <div className="grid grid-cols-3 gap-3">
              {['info', 'question', 'urgent'].map((type) => (
                <button
                  key={type}
                  onClick={() => setMessageType(type as any)}
                  className={`p-3 rounded-lg border text-sm font-medium transition-all duration-200 ${
                    messageType === type
                      ? getMessageTypeColor(type)
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {getMessageTypeLabel(type)}
                </button>
              ))}
            </div>
          </div>

          {/* Message Content */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mesaj İçeriği *
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-800 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 resize-none"
              placeholder={
                patientName 
                  ? `${patientName} hakkında doktora iletmek istediğiniz mesajı yazın...`
                  : 'Doktora iletmek istediğiniz mesajı yazın...'
              }
              required
            />
            <div className="mt-2 text-sm text-gray-500">
              {message.length}/500 karakter
            </div>
          </div>

          {/* Patient Info (if applicable) */}
          {patientName && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-blue-700">
                <span className="text-lg">👤</span>
                <span className="font-medium">Hasta: {patientName}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg transition-all duration-200"
            disabled={sending}
          >
            İptal
          </button>
          <button
            onClick={handleSendMessage}
            disabled={!selectedDoctorId || !message.trim() || sending}
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
                Mesaj Gönder
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DoctorMessageModal;
