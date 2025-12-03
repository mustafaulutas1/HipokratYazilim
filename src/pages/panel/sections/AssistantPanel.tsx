import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import AnamrezViewModal from './AnamrezViewModal';
import DoctorNotesModal from './DoctorNotesModal';
import DoctorMessageModal from '../components/DoctorMessageModal';
import DoctorSelectionModal from '../components/DoctorSelectionModal';

type PanelSection = 'dashboard' | 'patients' | 'appointments' | 'anamnez' | 'settings' | 'treatment-protocols' | 'users' | 'accounting' | 'pharmacy' | 'prescriptions' | 'assistant-panel' | 'doctor-panel' | 'treatment-panel';

interface AssistantPanelProps {
  doctorProfile?: any;
  onSectionChange?: (section: PanelSection) => void;
}

interface PatientStats {
  totalPatients: number;
  todayAppointments: number;
  completedTreatments: number;
  pendingReports: number;
}

interface WaitingPatient {
  id: string;
  fullName: string;
  tcNo: string;
  phone: string;
  birthDate: string;
  gender: string;
  address: string;
  emergencyPhone: string;
  visitReason: string;
  clinicId: string;
  isAnamnezCompleted: boolean;
  anamrezCompletedAt?: string;
  anamrezCompletedBy?: string;
  createdAt: string;
  updatedAt?: string;
  selectedDiagnosisSystems?: string[];
  assignedDoctorId?: string;
  assignedDoctorName?: string;
  assignedAt?: string;
  status?: string;
  pharmacyStatus?: string;
  paymentCompleted?: boolean;
  treatmentCompletedAt?: string;
  treatmentStartedAt?: string;
  priority?: 'normal' | 'urgent' | 'emergency';
}

interface AnamrezRecord {
  id: string;
  patientId: string;
  selectedDiagnosisSystems: string[];
  createdAt: string;
  updatedAt: string;
}

const AssistantPanel: React.FC<AssistantPanelProps> = ({ doctorProfile, onSectionChange }) => {
  const [stats, setStats] = useState<PatientStats>({
    totalPatients: 0,
    todayAppointments: 0,
    completedTreatments: 0,
    pendingReports: 0
  });
  const [waitingPatients, setWaitingPatients] = useState<WaitingPatient[]>([]);
  const [accountingPatients, setAccountingPatients] = useState<WaitingPatient[]>([]);
  const [treatmentCompletedPatients, setTreatmentCompletedPatients] = useState<WaitingPatient[]>([]);
  const [emergencyPatients, setEmergencyPatients] = useState<WaitingPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPatient, setSelectedPatient] = useState<WaitingPatient | null>(null);
  const [isAnamrezViewModalOpen, setIsAnamrezViewModalOpen] = useState(false);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [isDoctorSelectionModalOpen, setIsDoctorSelectionModalOpen] = useState(false);
  const [patientToAssign, setPatientToAssign] = useState<WaitingPatient | null>(null);
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [activeListType, setActiveListType] = useState<'anamnez_completed' | 'with_doctor' | 'waiting_accounting' | 'treatment_continue' | 'pharmacy_waiting' | 'treatment_completed' | 'emergency'>('anamnez_completed');
  const [withDoctorPatients, setWithDoctorPatients] = useState<WaitingPatient[]>([]);
  const [treatmentContinuePatients, setTreatmentContinuePatients] = useState<WaitingPatient[]>([]);
  const [pharmacyWaitingPatients, setPharmacyWaitingPatients] = useState<WaitingPatient[]>([]);

  useEffect(() => {
    const fetchDoctorData = async () => {
      if (!doctorProfile?.clinicId) return;

      try {
        setLoading(true);
        console.log('🔍 AssistantPanel: Fetching data for clinicId:', doctorProfile.clinicId);

        // Fetch patients with completed anamnez (waiting for treatment)
        // First, get all patients for this clinic
        console.log('🔍 AssistantPanel: Querying patients with clinicId:', doctorProfile.clinicId);
        
        const allClinicPatientsQuery = query(
          collection(db, 'patients'),
          where('clinicId', '==', doctorProfile.clinicId)
        );
        
        const allClinicSnapshot = await getDocs(allClinicPatientsQuery);
        const allClinicPatients = allClinicSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as WaitingPatient));
        
        console.log('📊 AssistantPanel: Total patients in clinic:', allClinicPatients.length);
        console.log('📋 AssistantPanel: Sample patient data:', allClinicPatients[0]);
        
        // Debug: Log all patients with their status
        console.log('🔍 AssistantPanel: All patients debug info:');
        allClinicPatients.forEach(patient => {
          console.log(`Patient: ${patient.fullName}`, {
            isAnamnezCompleted: patient.isAnamnezCompleted,
            assignedDoctorId: patient.assignedDoctorId,
            assignedDoctorName: patient.assignedDoctorName,
            status: patient.status
          });
        });
        
        // Filter for completed anamnez and either not assigned or ready for re-assignment
        // Patients are ready for re-assignment if:
        // - Not assigned to any doctor yet
        // - OR status indicates they completed previous treatment/visit
        const completedPatients = allClinicPatients.filter(patient => 
          patient.isAnamnezCompleted === true && 
          (
            !patient.assignedDoctorId || 
            patient.status === 'anamnez_completed' ||
            patient.status === 'treatment_completed' ||
            patient.status === 'discharged' ||
            patient.status === 'new' ||
            !patient.status
          )
        ).sort((a, b) => {
          const dateA = new Date(a.createdAt || 0).getTime();
          const dateB = new Date(b.createdAt || 0).getTime();
          return dateB - dateA; // Most recent first
        }).slice(0, 10);

        console.log('👥 AssistantPanel: Patients with completed anamnez (not assigned):', completedPatients.length);
        console.log('👥 AssistantPanel: Filtered patients:', completedPatients.map(p => p.fullName));
        
        // Fetch anamnez records for these patients to get their diagnosis systems
        if (completedPatients.length > 0) {
          const patientIds = completedPatients.map(p => p.id);
          const anamrezQuery = query(
            collection(db, 'anamrezRecords'),
            where('patientId', 'in', patientIds)
          );
          
          const anamrezSnapshot = await getDocs(anamrezQuery);
          const anamrezRecords = anamrezSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as AnamrezRecord));
          
          console.log('📋 AssistantPanel: Found anamnez records:', anamrezRecords.length);
          
          // Match diagnosis systems with patients and get anamnez completion date
          const patientsWithDiagnosis = completedPatients.map(patient => {
            const patientAnamrezRecords = anamrezRecords.filter(record => record.patientId === patient.id);
            const latestAnamrezRecord = patientAnamrezRecords.sort((a, b) => 
              new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
            )[0];
            
            return {
              ...patient,
              selectedDiagnosisSystems: patientAnamrezRecords
                .map(record => record.selectedDiagnosisSystems)
                .flat()
                .filter((system, index, arr) => arr.indexOf(system) === index), // Remove duplicates
              anamrezCompletedAt: latestAnamrezRecord ? (latestAnamrezRecord.updatedAt || latestAnamrezRecord.createdAt) : patient.anamrezCompletedAt
            };
          });
          
          // Sort by anamnez completion date - oldest first (earliest date first)
          const sortedPatients = patientsWithDiagnosis.sort((a, b) => {
            const dateA = new Date(a.anamrezCompletedAt || a.createdAt).getTime();
            const dateB = new Date(b.anamrezCompletedAt || b.createdAt).getTime();
            return dateA - dateB; // Oldest first
          });
          
          console.log('🔍 AssistantPanel: Patients sorted by anamnez completion:', sortedPatients.map(p => ({
            name: p.fullName,
            anamrezCompletedAt: p.anamrezCompletedAt,
            diagnosisSystems: p.selectedDiagnosisSystems
          })));
          
          setWaitingPatients(sortedPatients);
        } else {
          setWaitingPatients(completedPatients);
        }

        // Fetch patients currently with doctor
        const withDoctorFiltered = allClinicPatients.filter(patient =>
          patient.assignedDoctorId &&
          ['assigned_to_doctor', 'in_treatment'].includes(patient.status || '')
        ).sort((a, b) => {
          const dateA = new Date(a.assignedAt || a.createdAt || 0).getTime();
          const dateB = new Date(b.assignedAt || b.createdAt || 0).getTime();
          return dateB - dateA;
        });
        setWithDoctorPatients(withDoctorFiltered);

        // Fetch patients waiting for accounting (treatment decided but not paid)
        const accountingPatientsFiltered = allClinicPatients.filter(patient =>
          patient.status === 'treatment_decided' &&
          patient.assignedDoctorId
        ).sort((a, b) => {
          const dateA = new Date(a.createdAt || 0).getTime();
          const dateB = new Date(b.createdAt || 0).getTime();
          return dateB - dateA;
        });
        setAccountingPatients(accountingPatientsFiltered);

        // Fetch patients continuing treatment
        const treatmentContinueFiltered = allClinicPatients.filter(patient =>
          patient.status === 'treatment_continue'
        ).sort((a, b) => {
          const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
          const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
          return dateB - dateA;
        });
        setTreatmentContinuePatients(treatmentContinueFiltered);

        // Fetch patients waiting for pharmacy (pharmacyStatus: waiting)
        const pharmacyWaitingFiltered = allClinicPatients.filter(patient =>
          patient.pharmacyStatus === 'waiting'
        ).sort((a, b) => {
          const dateA = new Date(a.treatmentStartedAt || a.updatedAt || a.createdAt || 0).getTime();
          const dateB = new Date(b.treatmentStartedAt || b.updatedAt || b.createdAt || 0).getTime();
          return dateB - dateA;
        });
        setPharmacyWaitingPatients(pharmacyWaitingFiltered);

        // Fetch fully completed treatments (paid and discharged)
        const treatmentCompletedFiltered = allClinicPatients.filter(patient =>
          patient.status === 'discharged' ||
          (patient.status === 'treatment_completed' && patient.paymentCompleted)
        ).sort((a, b) => {
          const dateA = new Date(a.createdAt || 0).getTime();
          const dateB = new Date(b.createdAt || 0).getTime();
          return dateB - dateA;
        }).slice(0, 20);
        setTreatmentCompletedPatients(treatmentCompletedFiltered);

        // Fetch emergency patients (marked as emergency or urgent)
        const emergencyPatientsFiltered = allClinicPatients.filter(patient =>
          (patient as any).isEmergency === true ||
          patient.priority === 'emergency' ||
          patient.priority === 'urgent' ||
          patient.visitReason?.toLowerCase().includes('acil') ||
          patient.visitReason?.toLowerCase().includes('emergency')
        ).sort((a, b) => {
          const dateA = new Date(a.createdAt || 0).getTime();
          const dateB = new Date(b.createdAt || 0).getTime();
          return dateB - dateA;
        });
        setEmergencyPatients(emergencyPatientsFiltered);

        // Get the final waiting patients count for stats
        const finalWaitingPatientsCount = completedPatients.length;

        // Fetch total patients count for this clinic
        const allPatientsQuery = query(
          collection(db, 'patients'),
          where('clinicId', '==', doctorProfile.clinicId)
        );
        const allPatientsSnapshot = await getDocs(allPatientsQuery);
        const totalPatients = allPatientsSnapshot.size;

        // Fetch today's appointments
        const todayForStats = new Date();
        const todayDateStringForStats = todayForStats.toISOString().split('T')[0]; // YYYY-MM-DD format
        console.log('📅 AssistantPanel: Looking for appointments on date:', todayDateStringForStats);
        
        let todayAppointments = 0;
        try {
          // Try different date formats - some might be stored as date strings
          const appointmentsQuery = query(
            collection(db, 'appointments'),
            where('clinicId', '==', doctorProfile.clinicId)
          );
          const appointmentsSnapshot = await getDocs(appointmentsQuery);
          
          // Filter by today's date in memory to handle different date formats
          const todayAppointmentsList = appointmentsSnapshot.docs.filter(doc => {
            const data = doc.data();
            const appointmentDate = data.date || data.appointmentDate || data.scheduledDate;
            if (!appointmentDate) return false;
            
            // Handle different date formats
            const dateStr = typeof appointmentDate === 'string' ?
              appointmentDate.split('T')[0] :
              new Date(appointmentDate).toISOString().split('T')[0];

            return dateStr === todayDateStringForStats;
          });
          
          todayAppointments = todayAppointmentsList.length;
          console.log('📅 DoctorPanel: Found today\'s appointments:', todayAppointments);
          console.log('📅 DoctorPanel: Sample appointment data:', todayAppointmentsList[0]?.data());
        } catch (appointmentError) {
          console.warn('⚠️ Could not fetch today\'s appointments, using fallback:', appointmentError);
          // Fallback: estimate based on clinic size
          todayAppointments = Math.max(1, Math.floor(totalPatients * 0.15));
        }

        // Fetch completed treatments (completed anamnez records)
        let completedTreatments = 0;
        try {
          const completedAnamrezQuery = query(
            collection(db, 'patients'),
            where('clinicId', '==', doctorProfile.clinicId),
            where('isAnamnezCompleted', '==', true)
          );
          const completedAnamrezSnapshot = await getDocs(completedAnamrezQuery);
          completedTreatments = completedAnamrezSnapshot.size;
          console.log('🩺 DoctorPanel: Completed treatments:', completedTreatments);
        } catch (treatmentError) {
          console.warn('⚠️ Could not fetch completed treatments:', treatmentError);
          completedTreatments = completedPatients.length;
        }

        const finalStats = {
          totalPatients: totalPatients,
          todayAppointments: todayAppointments,
          completedTreatments: completedTreatments,
          pendingReports: finalWaitingPatientsCount // Use actual waiting patients count
        };
        
        console.log('📊 DoctorPanel: Final stats:', finalStats);
        setStats(finalStats);

      } catch (error) {
        console.error('❌ DoctorPanel: Error fetching doctor data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDoctorData();
  }, [doctorProfile]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const calculateAge = (birthDate: string) => {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    
    return age;
  };

  const handleViewAnamnez = (patient: WaitingPatient) => {
    setSelectedPatient(patient);
    setIsAnamrezViewModalOpen(true);
  };

  const handleSendToDoctor = (patient: WaitingPatient) => {
    setPatientToAssign(patient);
    setIsDoctorSelectionModalOpen(true);
  };

  const handlePatientAssigned = () => {
    // Refresh the patient list after assignment with a small delay to ensure database update
    setTimeout(() => {
      fetchDoctorData();
    }, 500);
  };

  const fetchDoctorData = async () => {
    if (!doctorProfile?.clinicId) return;

    try {
      setLoading(true);
      console.log('🔍 AssistantPanel: Fetching data for clinicId:', doctorProfile.clinicId);

      // Fetch patients with completed anamnez (waiting for treatment)
      // First, get all patients for this clinic
      console.log('🔍 AssistantPanel: Querying patients with clinicId:', doctorProfile.clinicId);
      
      const allClinicPatientsQuery = query(
        collection(db, 'patients'),
        where('clinicId', '==', doctorProfile.clinicId)
      );
      
      const allClinicSnapshot = await getDocs(allClinicPatientsQuery);
      const allClinicPatients = allClinicSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as WaitingPatient));
      
      console.log('📊 AssistantPanel: Total patients in clinic:', allClinicPatients.length);
      console.log('📋 AssistantPanel: Sample patient data:', allClinicPatients[0]);
      
      // Filter for completed anamnez and either not assigned or treatment completed (for re-assignment)
      const completedPatients = allClinicPatients.filter(patient => 
        patient.isAnamnezCompleted === true && 
        (!patient.assignedDoctorId || patient.status === 'treatment_completed')
      ).sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA; // Most recent first
      }).slice(0, 10);

      console.log('👥 AssistantPanel: Patients with completed anamnez (not assigned):', completedPatients.length);
      
      // Fetch anamnez records for these patients to get their diagnosis systems
      if (completedPatients.length > 0) {
        const patientIds = completedPatients.map(p => p.id);
        const anamrezQuery = query(
          collection(db, 'anamrezRecords'),
          where('patientId', 'in', patientIds)
        );
        
        const anamrezSnapshot = await getDocs(anamrezQuery);
        const anamrezRecords = anamrezSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as AnamrezRecord));
        
        console.log('📋 AssistantPanel: Found anamnez records:', anamrezRecords.length);
        
        // Match diagnosis systems with patients and get anamnez completion date
        const patientsWithDiagnosis = completedPatients.map(patient => {
          const patientAnamrezRecords = anamrezRecords.filter(record => record.patientId === patient.id);
          const latestAnamrezRecord = patientAnamrezRecords.sort((a, b) => 
            new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
          )[0];
          
          return {
            ...patient,
            selectedDiagnosisSystems: patientAnamrezRecords
              .map(record => record.selectedDiagnosisSystems)
              .flat()
              .filter((system, index, arr) => arr.indexOf(system) === index), // Remove duplicates
            anamrezCompletedAt: latestAnamrezRecord ? (latestAnamrezRecord.updatedAt || latestAnamrezRecord.createdAt) : patient.anamrezCompletedAt
          };
        });
        
        // Sort by anamnez completion date - oldest first (earliest date first)
        const sortedPatients = patientsWithDiagnosis.sort((a, b) => {
          const dateA = new Date(a.anamrezCompletedAt || a.createdAt).getTime();
          const dateB = new Date(b.anamrezCompletedAt || b.createdAt).getTime();
          return dateA - dateB; // Oldest first
        });
        
        console.log('🔍 AssistantPanel: Patients sorted by anamnez completion:', sortedPatients.map(p => ({
          name: p.fullName,
          anamrezCompletedAt: p.anamrezCompletedAt,
          diagnosisSystems: p.selectedDiagnosisSystems
        })));
        
        setWaitingPatients(sortedPatients);
      } else {
        setWaitingPatients(completedPatients);
      }

      // Fetch patients currently with doctor
      const withDoctorFiltered = allClinicPatients.filter(patient =>
        patient.assignedDoctorId &&
        ['assigned_to_doctor', 'in_treatment'].includes(patient.status || '')
      ).sort((a, b) => {
        const dateA = new Date(a.assignedAt || a.createdAt || 0).getTime();
        const dateB = new Date(b.assignedAt || b.createdAt || 0).getTime();
        return dateB - dateA;
      });
      setWithDoctorPatients(withDoctorFiltered);

      // Fetch patients waiting for accounting (treatment decided but not paid)
      const accountingPatientsFiltered = allClinicPatients.filter(patient =>
        patient.status === 'treatment_decided' &&
        patient.assignedDoctorId
      ).sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });
      setAccountingPatients(accountingPatientsFiltered);

      // Fetch patients continuing treatment
      const treatmentContinueFiltered = allClinicPatients.filter(patient =>
        patient.status === 'treatment_continue'
      ).sort((a, b) => {
        const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return dateB - dateA;
      });
      setTreatmentContinuePatients(treatmentContinueFiltered);

      // Fetch fully completed treatments (paid and discharged)
      const treatmentCompletedFiltered = allClinicPatients.filter(patient =>
        patient.status === 'discharged' ||
        (patient.status === 'treatment_completed' && patient.paymentCompleted)
      ).sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      }).slice(0, 20);
      setTreatmentCompletedPatients(treatmentCompletedFiltered);

      // Fetch emergency patients (marked as emergency or urgent)
      const emergencyPatientsFiltered = allClinicPatients.filter(patient =>
        (patient as any).isEmergency === true ||
        patient.priority === 'emergency' ||
        patient.priority === 'urgent' ||
        patient.visitReason?.toLowerCase().includes('acil') ||
        patient.visitReason?.toLowerCase().includes('emergency')
      ).sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });
      setEmergencyPatients(emergencyPatientsFiltered);

      // Get the final waiting patients count for stats
      const finalWaitingPatientsCount = completedPatients.length;

      // Fetch total patients count for this clinic
      const allPatientsQuery = query(
        collection(db, 'patients'),
        where('clinicId', '==', doctorProfile.clinicId)
      );
      const allPatientsSnapshot = await getDocs(allPatientsQuery);
      const totalPatients = allPatientsSnapshot.size;

      // Fetch today's appointments
      const todayForDuplicateStats = new Date();
      const todayDateStringForDuplicateStats = todayForDuplicateStats.toISOString().split('T')[0]; // YYYY-MM-DD format
      console.log('📅 AssistantPanel: Looking for appointments on date:', todayDateStringForDuplicateStats);
      
      let todayAppointments = 0;
      try {
        // Try different date formats - some might be stored as date strings
        const appointmentsQuery = query(
          collection(db, 'appointments'),
          where('clinicId', '==', doctorProfile.clinicId)
        );
        const appointmentsSnapshot = await getDocs(appointmentsQuery);
        
        // Filter by today's date in memory to handle different date formats
        const todayAppointmentsList = appointmentsSnapshot.docs.filter(doc => {
          const data = doc.data();
          const appointmentDate = data.date || data.appointmentDate || data.scheduledDate;
          if (!appointmentDate) return false;
          
          // Handle different date formats
          const dateStr = typeof appointmentDate === 'string' ?
            appointmentDate.split('T')[0] :
            new Date(appointmentDate).toISOString().split('T')[0];

          return dateStr === todayDateStringForDuplicateStats;
        });
        
        todayAppointments = todayAppointmentsList.length;
        console.log('📅 AssistantPanel: Found today\'s appointments:', todayAppointments);
        console.log('📅 AssistantPanel: Sample appointment data:', todayAppointmentsList[0]?.data());
      } catch (appointmentError) {
        console.warn('⚠️ Could not fetch today\'s appointments, using fallback:', appointmentError);
        // Fallback: estimate based on clinic size
        todayAppointments = Math.max(1, Math.floor(totalPatients * 0.15));
      }

      // Fetch completed treatments (completed anamnez records)
      let completedTreatments = 0;
      try {
        const completedAnamrezQuery = query(
          collection(db, 'patients'),
          where('clinicId', '==', doctorProfile.clinicId),
          where('isAnamnezCompleted', '==', true)
        );
        const completedAnamrezSnapshot = await getDocs(completedAnamrezQuery);
        completedTreatments = completedAnamrezSnapshot.size;
        console.log('🩺 AssistantPanel: Completed treatments:', completedTreatments);
      } catch (treatmentError) {
        console.warn('⚠️ Could not fetch completed treatments:', treatmentError);
        completedTreatments = completedPatients.length;
      }

      const finalStats = {
        totalPatients: totalPatients,
        todayAppointments: todayAppointments,
        completedTreatments: completedTreatments,
        pendingReports: finalWaitingPatientsCount // Use actual waiting patients count
      };
      
      console.log('📊 AssistantPanel: Final stats:', finalStats);
      setStats(finalStats);

    } catch (error) {
      console.error('❌ AssistantPanel: Error fetching doctor data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCurrentPatientList = () => {
    switch (activeListType) {
      case 'anamnez_completed':
        return waitingPatients;
      case 'with_doctor':
        return withDoctorPatients;
      case 'waiting_accounting':
        return accountingPatients;
      case 'treatment_continue':
        return treatmentContinuePatients;
      case 'pharmacy_waiting':
        return pharmacyWaitingPatients;
      case 'treatment_completed':
        return treatmentCompletedPatients;
      case 'emergency':
        return emergencyPatients;
      default:
        return waitingPatients;
    }
  };

  const getCurrentListTitle = () => {
    switch (activeListType) {
      case 'anamnez_completed':
        return 'Doktora Gönderilecek Hastalar';
      case 'with_doctor':
        return 'Doktor İle Görüşmede Olanlar';
      case 'waiting_accounting':
        return 'Muhasebede Bekleyen Hastalar';
      case 'treatment_continue':
        return 'Tedavisi Devam Eden Hastalar';
      case 'pharmacy_waiting':
        return 'Eczanede Bekleyen Hastalar';
      case 'treatment_completed':
        return 'Tedavi Tamamlanan Hastalar';
      case 'emergency':
        return 'Acil Durum Hastaları';
      default:
        return 'Hasta Listesi';
    }
  };

  const getCurrentListIcon = () => {
    switch (activeListType) {
      case 'anamnez_completed':
        return '📤';
      case 'with_doctor':
        return '👨‍⚕️';
      case 'waiting_accounting':
        return '💰';
      case 'treatment_continue':
        return '🏥';
      case 'pharmacy_waiting':
        return '💊';
      case 'treatment_completed':
        return '🏁';
      case 'emergency':
        return '🚨';
      default:
        return '📋';
    }
  };

  const getWaitingDuration = (completedDate: string) => {
    const completed = new Date(completedDate);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - completed.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 24) {
      return `${diffInHours} saat`;
    } else {
      const days = Math.floor(diffInHours / 24);
      return `${days} gün`;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <span className="text-3xl">👨‍⚕️</span>
            Asistan Ekranı
          </h2>
          <p className="text-white/70">
            Hoş geldiniz, {doctorProfile?.fullName || 'Asistan'}
          </p>
          <p className="text-white/50 text-xs mt-1">
            💡 Her doktor aynı anda sadece bir hasta ile ilgilenebilir
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
          <span className="text-white/80 text-sm">Aktif</span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/30 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm font-medium">Takip Ettiğim Hastalar</p>
              <p className="text-2xl font-bold text-white">{stats.totalPatients}</p>
            </div>
            <div className="w-12 h-12 bg-blue-500/30 rounded-xl flex items-center justify-center">
              <span className="text-2xl">👥</span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500/20 to-green-600/30 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm font-medium">Bugünkü Randevular</p>
              <p className="text-2xl font-bold text-white">{stats.todayAppointments}</p>
            </div>
            <div className="w-12 h-12 bg-green-500/30 rounded-xl flex items-center justify-center">
              <span className="text-2xl">📅</span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/30 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm font-medium">İşlenen Anamnezler</p>
              <p className="text-2xl font-bold text-white">{stats.completedTreatments}</p>
            </div>
            <div className="w-12 h-12 bg-purple-500/30 rounded-xl flex items-center justify-center">
              <span className="text-2xl">📋</span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-500/20 to-orange-600/30 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm font-medium">Doktora Gönderilecek</p>
              <p className="text-2xl font-bold text-white">{waitingPatients.length}</p>
            </div>
            <div className="w-12 h-12 bg-orange-500/30 rounded-xl flex items-center justify-center">
              <span className="text-2xl">🏥</span>
            </div>
          </div>
        </div>
      </div>

      {/* List Filter Buttons */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <span className="text-2xl">📋</span>
          Hasta Listesi Filtreleri
        </h3>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setActiveListType('anamnez_completed')}
            className={`px-4 py-2 rounded-xl font-medium text-sm transition-all duration-200 flex items-center gap-2 ${
              activeListType === 'anamnez_completed'
                ? 'bg-blue-500/30 border-2 border-blue-400 text-blue-200'
                : 'bg-white/5 border border-white/20 text-white/70 hover:bg-white/10'
            }`}
          >
            <span className="text-lg">✅</span>
            Anamnez Tamamlananlar ({waitingPatients.length})
          </button>

          <button
            onClick={() => setActiveListType('with_doctor')}
            className={`px-4 py-2 rounded-xl font-medium text-sm transition-all duration-200 flex items-center gap-2 ${
              activeListType === 'with_doctor'
                ? 'bg-indigo-500/30 border-2 border-indigo-400 text-indigo-200'
                : 'bg-white/5 border border-white/20 text-white/70 hover:bg-white/10'
            }`}
          >
            <span className="text-lg">👨‍⚕️</span>
            Doktor İle Görüşmede ({withDoctorPatients.length})
          </button>

          <button
            onClick={() => setActiveListType('waiting_accounting')}
            className={`px-4 py-2 rounded-xl font-medium text-sm transition-all duration-200 flex items-center gap-2 ${
              activeListType === 'waiting_accounting'
                ? 'bg-orange-500/30 border-2 border-orange-400 text-orange-200'
                : 'bg-white/5 border border-white/20 text-white/70 hover:bg-white/10'
            }`}
          >
            <span className="text-lg">💰</span>
            Muhasebede Bekleyenler ({accountingPatients.length})
          </button>

          <button
            onClick={() => setActiveListType('treatment_continue')}
            className={`px-4 py-2 rounded-xl font-medium text-sm transition-all duration-200 flex items-center gap-2 ${
              activeListType === 'treatment_continue'
                ? 'bg-cyan-500/30 border-2 border-cyan-400 text-cyan-200'
                : 'bg-white/5 border border-white/20 text-white/70 hover:bg-white/10'
            }`}
          >
            <span className="text-lg">🏥</span>
            Tedavisi Devam Edenler ({treatmentContinuePatients.length})
          </button>

          <button
            onClick={() => setActiveListType('pharmacy_waiting')}
            className={`px-4 py-2 rounded-xl font-medium text-sm transition-all duration-200 flex items-center gap-2 ${
              activeListType === 'pharmacy_waiting'
                ? 'bg-purple-500/30 border-2 border-purple-400 text-purple-200'
                : 'bg-white/5 border border-white/20 text-white/70 hover:bg-white/10'
            }`}
          >
            <span className="text-lg">💊</span>
            Eczanede Bekleyenler ({pharmacyWaitingPatients.length})
          </button>

          <button
            onClick={() => setActiveListType('treatment_completed')}
            className={`px-4 py-2 rounded-xl font-medium text-sm transition-all duration-200 flex items-center gap-2 ${
              activeListType === 'treatment_completed'
                ? 'bg-green-500/30 border-2 border-green-400 text-green-200'
                : 'bg-white/5 border border-white/20 text-white/70 hover:bg-white/10'
            }`}
          >
            <span className="text-lg">🏁</span>
            Tedavi Tamamlananlar ({treatmentCompletedPatients.length})
          </button>

          <button
            onClick={() => setActiveListType('emergency')}
            className={`px-4 py-2 rounded-xl font-medium text-sm transition-all duration-200 flex items-center gap-2 ${
              activeListType === 'emergency'
                ? 'bg-red-500/30 border-2 border-red-400 text-red-200'
                : 'bg-white/5 border border-white/20 text-white/70 hover:bg-white/10'
            }`}
          >
            <span className="text-lg">🚨</span>
            Acil Durumlar ({emergencyPatients.length})
          </button>

        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Patients Waiting for Treatment */}
        <div className="lg:col-span-2 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <span className="text-2xl">{getCurrentListIcon()}</span>
            {getCurrentListTitle()} ({getCurrentPatientList().length})
          </h3>
          
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {getCurrentPatientList().length > 0 ? (
              getCurrentPatientList().map((patient) => (
                <div 
                  key={patient.id}
                  className="flex items-center gap-4 p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-all duration-200"
                >
                  <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-lg">👤</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-medium">{patient.fullName}</span>
                      {activeListType === 'anamnez_completed' && (
                        <>
                          <span className="text-xs bg-green-500/30 text-green-200 px-2 py-1 rounded-full">
                            Anamnez Tamamlandı
                          </span>
                          <span className="text-xs bg-orange-500/30 text-orange-200 px-2 py-1 rounded-full">
                            {getWaitingDuration(patient.anamrezCompletedAt || patient.createdAt)} bekliyor
                          </span>
                        </>
                      )}
                      {activeListType === 'with_doctor' && (
                        <span className="text-xs bg-indigo-500/30 text-indigo-200 px-2 py-1 rounded-full flex items-center gap-1">
                          👨‍⚕️ {patient.assignedDoctorName || 'Doktor Atanmış'}
                        </span>
                      )}
                      {activeListType === 'waiting_accounting' && (
                        <span className="text-xs bg-yellow-500/30 text-yellow-200 px-2 py-1 rounded-full">
                          Tedavi Kararı Verildi
                        </span>
                      )}
                      {activeListType === 'treatment_continue' && (
                        <span className="text-xs bg-cyan-500/30 text-cyan-200 px-2 py-1 rounded-full">
                          Tedavi Devam Ediyor
                        </span>
                      )}
                      {activeListType === 'pharmacy_waiting' && (
                        <span className="text-xs bg-purple-500/30 text-purple-200 px-2 py-1 rounded-full">
                          Eczane Sırasında
                        </span>
                      )}
                      {activeListType === 'treatment_completed' && (
                        <span className="text-xs bg-green-500/30 text-green-200 px-2 py-1 rounded-full">
                          Tedavi Tamamlandı
                        </span>
                      )}
                      {activeListType === 'emergency' && (
                        <span className="text-xs bg-red-500/30 text-red-200 px-2 py-1 rounded-full animate-pulse">
                          ACİL DURUM
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-white/70 text-sm">
                      <span>Yaş: {calculateAge(patient.birthDate)}</span>
                      <span>•</span>
                      <span>Cinsiyet: {patient.gender || '-'}</span>
                      <span>•</span>
                      <span>Tel: {patient.phone}</span>
                    </div>
                    <div className="mt-1">
                      <p className="text-white/70 text-sm font-medium mb-1">Hasta Şikayetleri:</p>
                      <div className="flex flex-wrap gap-1">
                        {patient.selectedDiagnosisSystems && patient.selectedDiagnosisSystems.length > 0 ? (
                          patient.selectedDiagnosisSystems.map((system, index) => (
                            <span 
                              key={index}
                              className="px-2 py-1 bg-blue-500/20 text-blue-200 text-xs rounded-full border border-blue-500/30"
                            >
                              {system}
                            </span>
                          ))
                        ) : (
                          <span className="text-white/50 text-xs italic">Sistem seçimi bulunamadı</span>
                        )}
                      </div>
                    </div>
                    {activeListType === 'emergency' && (patient as any).emergencyCause && (
                      <div className="mt-2 bg-red-500/20 border border-red-500/30 rounded-lg p-3">
                        <p className="text-red-200 text-xs font-semibold mb-1">🚨 Acil Durum Nedeni:</p>
                        <p className="text-red-100 text-sm font-medium">{(patient as any).emergencyCause}</p>
                        {(patient as any).emergencyMarkedBy && (
                          <p className="text-red-200/70 text-xs mt-1">
                            İşaretleyen: {(patient as any).emergencyMarkedBy} • {formatDate((patient as any).emergencyMarkedAt)}
                          </p>
                        )}
                      </div>
                    )}
                    <p className="text-white/50 text-xs mt-1">
                      {activeListType === 'anamnez_completed' && `Anamnez Tamamlanma: ${formatDate(patient.anamrezCompletedAt || patient.createdAt)}`}
                      {activeListType === 'with_doctor' && `Görüşme Başlangıcı: ${formatDate(patient.assignedAt || patient.createdAt)}`}
                      {activeListType === 'waiting_accounting' && `Tedavi Kararı: ${formatDate(patient.createdAt)}`}
                      {activeListType === 'treatment_continue' && `Tedavi Başlangıcı: ${formatDate(patient.updatedAt || patient.createdAt)}`}
                      {activeListType === 'pharmacy_waiting' && `Tedavi Başlangıcı: ${formatDate(patient.treatmentStartedAt || patient.updatedAt || patient.createdAt)}`}
                      {activeListType === 'treatment_completed' && `Taburcu: ${formatDate(patient.createdAt)}`}
                      {activeListType === 'emergency' && `Acil Kayıt: ${formatDate(patient.createdAt)}`}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {activeListType === 'anamnez_completed' && (
                      <button
                        onClick={() => handleSendToDoctor(patient)}
                        className="px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg text-blue-200 text-sm transition-all duration-200"
                      >
                        Doktora Gönder
                      </button>
                    )}
                    {activeListType === 'emergency' && (
                      <button
                        className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-red-200 text-sm transition-all duration-200"
                      >
                        Acil İşlem
                      </button>
                    )}
                    <button
                      onClick={() => handleViewAnamnez(patient)}
                      className="px-3 py-1 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 rounded-lg text-purple-200 text-sm transition-all duration-200"
                    >
                      Anamnez Görüntüle
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <div className="text-6xl mb-4">{getCurrentListIcon()}</div>
                <h4 className="text-white/80 text-lg font-semibold mb-2">
                  {activeListType === 'anamnez_completed' && 'Gönderilecek Hasta Yok'}
                  {activeListType === 'with_doctor' && 'Doktorla Görüşen Hasta Yok'}
                  {activeListType === 'waiting_accounting' && 'Tedavi Kararı Verilen Hasta Yok'}
                  {activeListType === 'treatment_continue' && 'Tedavisi Devam Eden Hasta Yok'}
                  {activeListType === 'pharmacy_waiting' && 'Eczanede Bekleyen Hasta Yok'}
                  {activeListType === 'treatment_completed' && 'Tedavi Tamamlanan Hasta Yok'}
                  {activeListType === 'emergency' && 'Acil Durum Hastası Yok'}
                </h4>
                <p className="text-white/60">
                  {activeListType === 'anamnez_completed' && 'Anamnezi tamamlanmış ve doktora gönderilmeyi bekleyen hasta bulunmuyor.'}
                  {activeListType === 'with_doctor' && 'Şu anda doktorla görüşen hasta bulunmuyor.'}
                  {activeListType === 'waiting_accounting' && 'Doktor tarafından tedavi kararı verilmiş hasta bulunmuyor.'}
                  {activeListType === 'treatment_continue' && 'Ödemesi yapılmış ve tedavisi devam eden hasta bulunmuyor.'}
                  {activeListType === 'pharmacy_waiting' && 'Eczanede işlem bekleyen hasta bulunmuyor.'}
                  {activeListType === 'treatment_completed' && 'Tedavisi tamamen bitmiş hasta bulunmuyor.'}
                  {activeListType === 'emergency' && 'Acil durum hastası bulunmuyor.'}
                </p>
                {activeListType === 'anamnez_completed' && (
                  <p className="text-white/50 text-xs mt-2">💡 Doktorlar aynı anda sadece bir hasta ile ilgilenebilir</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <span className="text-2xl">⚡</span>
            Asistan Hızlı İşlemler
          </h3>
          
          <div className="space-y-3">
            <button 
              onClick={() => setIsNotesModalOpen(true)}
              className="w-full flex items-center gap-3 p-3 bg-gradient-to-r from-blue-500/20 to-blue-600/30 hover:from-blue-500/30 hover:to-blue-600/40 border border-blue-500/30 rounded-xl text-white transition-all duration-200"
            >
              <span className="text-lg">📝</span>
              <span className="font-medium text-sm">Hasta Notu Ekle</span>
            </button>
            
            <button 
              onClick={() => onSectionChange ? onSectionChange('appointments') : console.log('onSectionChange not provided')}
              className="w-full flex items-center gap-3 p-3 bg-gradient-to-r from-purple-500/20 to-purple-600/30 hover:from-purple-500/30 hover:to-purple-600/40 border border-purple-500/30 rounded-xl text-white transition-all duration-200"
            >
              <span className="text-lg">📅</span>
              <span className="font-medium text-sm">Randevu Planla</span>
            </button>
            
            <button 
              onClick={() => setIsMessageModalOpen(true)}
              className="w-full flex items-center gap-3 p-3 bg-gradient-to-r from-orange-500/20 to-orange-600/30 hover:from-orange-500/30 hover:to-orange-600/40 border border-orange-500/30 rounded-xl text-white transition-all duration-200"
            >
              <span className="text-lg">👨‍⚕️</span>
              <span className="font-medium text-sm">Doktora Bildir</span>
            </button>
            
          </div>
        </div>
      </div>

      {/* Additional Information */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <span className="text-2xl">👨‍💼</span>
          Asistan Bilgileri
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-white/70 text-sm font-medium mb-1">Görev Alanı</p>
            <p className="text-white">{doctorProfile?.specialization || doctorProfile?.department || 'Hasta Yönetimi'}</p>
          </div>
          <div>
            <p className="text-white/70 text-sm font-medium mb-1">Çalıştığı Klinik</p>
            <p className="text-white">{doctorProfile?.hospital || 'Belirtilmemiş'}</p>
          </div>
          <div>
            <p className="text-white/70 text-sm font-medium mb-1">Bölüm</p>
            <p className="text-white">{doctorProfile?.department || 'Genel Asistan'}</p>
          </div>
        </div>
      </div>

      {/* Doctor Notes Modal */}
      <DoctorNotesModal
        isOpen={isNotesModalOpen}
        onClose={() => setIsNotesModalOpen(false)}
        doctorProfile={doctorProfile}
      />

      {/* Anamnez View Modal */}
      <AnamrezViewModal
        isOpen={isAnamrezViewModalOpen}
        onClose={() => setIsAnamrezViewModalOpen(false)}
        patient={selectedPatient}
      />

      {/* Doctor Selection Modal */}
      <DoctorSelectionModal
        isOpen={isDoctorSelectionModalOpen}
        onClose={() => setIsDoctorSelectionModalOpen(false)}
        patient={patientToAssign}
        clinicId={doctorProfile?.clinicId || ''}
        onPatientAssigned={handlePatientAssigned}
      />

      {/* Doctor Message Modal */}
      <DoctorMessageModal
        isOpen={isMessageModalOpen}
        onClose={() => setIsMessageModalOpen(false)}
        patientId={undefined}
        patientName={undefined}
        doctorProfile={doctorProfile}
      />
    </div>
  );
};

export default AssistantPanel;
