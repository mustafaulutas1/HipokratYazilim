import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase/config';

interface SurveyQuestion {
  id: string;
  question: string;
  icon: string;
}

interface SurveyRatings {
  [key: string]: number;
}

interface DischargeSurveyModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: {
    id: string;
    fullName: string;
  } | null;
  onSurveyCompleted: () => void;
}

const surveyQuestions: SurveyQuestion[] = [
  {
    id: 'overall_satisfaction',
    question: 'Genel tedavi sürecinizden ne kadar memnun kaldınız?',
    icon: '😊'
  },
  {
    id: 'staff_friendliness',
    question: 'Personelimizin ilgi ve alakasını nasıl değerlendirirsiniz?',
    icon: '👨‍⚕️'
  },
  {
    id: 'treatment_effectiveness',
    question: 'Uygulanan tedavinin etkisini nasıl değerlendirirsiniz?',
    icon: '💊'
  },
  {
    id: 'cleanliness',
    question: 'Kliniğin hijyen ve temizliğini nasıl değerlendirirsiniz?',
    icon: '✨'
  },
  {
    id: 'recommendation',
    question: 'Kliniğimizi yakınlarınıza tavsiye eder misiniz?',
    icon: '🌟'
  }
];

const ratingLabels = ['Çok Kötü', 'Kötü', 'Orta', 'İyi', 'Mükemmel'];
const ratingEmojis = ['😞', '😕', '😐', '😊', '🤩'];
const ratingColors = [
  'from-red-500 to-red-600',
  'from-orange-500 to-orange-600',
  'from-yellow-500 to-amber-500',
  'from-green-500 to-green-600',
  'from-emerald-500 to-teal-500'
];

const DischargeSurveyModal: React.FC<DischargeSurveyModalProps> = ({
  isOpen,
  onClose,
  patient,
  onSurveyCompleted
}) => {
  const [ratings, setRatings] = useState<SurveyRatings>({});
  const [additionalFeedback, setAdditionalFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [hoveredRating, setHoveredRating] = useState<{ questionId: string; rating: number } | null>(null);

  if (!isOpen || !patient) return null;

  const handleRating = (questionId: string, rating: number) => {
    setRatings(prev => ({ ...prev, [questionId]: rating }));
    
    // Auto-advance to next question after a short delay
    setTimeout(() => {
      setCurrentStep(prev => {
        if (prev < surveyQuestions.length - 1) {
          return prev + 1;
        }
        return prev;
      });
    }, 300);
  };

  const handleSubmit = async () => {
    // Check if all questions are answered
    const unansweredQuestions = surveyQuestions.filter(q => !ratings[q.id]);
    if (unansweredQuestions.length > 0) {
      // Go to first unanswered question
      const firstUnansweredIndex = surveyQuestions.findIndex(q => !ratings[q.id]);
      setCurrentStep(firstUnansweredIndex);
      return;
    }

    try {
      setIsSubmitting(true);

      // Calculate average rating
      const totalRating = Object.values(ratings).reduce((sum, r) => sum + r, 0);
      const averageRating = totalRating / surveyQuestions.length;

      // Save survey data to the patient document
      const patientRef = doc(db, 'patients', patient.id);
      await updateDoc(patientRef, {
        dischargeSurvey: {
          ratings,
          additionalFeedback: additionalFeedback.trim(),
          averageRating,
          completedAt: new Date().toISOString()
        },
        status: 'discharged',
        dischargedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      setIsCompleted(true);
      
      // Wait a moment to show success animation
      setTimeout(() => {
        onSurveyCompleted();
        handleClose();
      }, 2000);

    } catch (error) {
      console.error('Error saving survey:', error);
      alert('Anket kaydedilirken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setRatings({});
    setAdditionalFeedback('');
    setCurrentStep(0);
    setIsCompleted(false);
    onClose();
  };

  const handleSkipSurvey = async () => {
    try {
      setIsSubmitting(true);
      
      // Discharge without survey
      const patientRef = doc(db, 'patients', patient.id);
      await updateDoc(patientRef, {
        dischargeSurvey: null,
        status: 'discharged',
        dischargedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      onSurveyCompleted();
      handleClose();
    } catch (error) {
      console.error('Error discharging patient:', error);
      alert('Hasta çıkışı yapılırken bir hata oluştu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const allQuestionsAnswered = surveyQuestions.every(q => ratings[q.id]);
  const safeStep = Math.min(currentStep, surveyQuestions.length - 1);
  const currentQuestion = surveyQuestions[safeStep];
  const answeredCount = Object.keys(ratings).length;

  // Success completion view
  if (isCompleted) {
    return (
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-2xl animate-[scaleIn_0.3s_ease-out]">
          <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-emerald-400 to-green-500 rounded-full flex items-center justify-center animate-[bounce_1s_ease-in-out_infinite] shadow-lg shadow-emerald-200">
            <span className="text-5xl text-white">✓</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-3">Teşekkürler!</h2>
          <p className="text-gray-600 mb-2">
            Değerli geri bildiriminiz için teşekkür ederiz.
          </p>
          <p className="text-gray-500 text-sm">
            {patient.fullName} başarıyla taburcu edildi.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-2xl">📋</span>
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Hasta Memnuniyet Anketi</h2>
                <p className="text-white/80 text-sm">{patient.fullName}</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <span className="text-white/80 hover:text-white text-xl">✕</span>
            </button>
          </div>
          
          {/* Progress Steps */}
          <div className="relative">
            {/* Progress line background */}
            <div className="absolute top-3 left-0 right-0 h-1 bg-white/20 rounded-full" />
            {/* Progress line filled */}
            <div 
              className="absolute top-3 left-0 h-1 bg-white rounded-full transition-all duration-500 ease-out"
              style={{ width: `${(currentStep / (surveyQuestions.length - 1)) * 100}%` }}
            />
            
            {/* Step circles */}
            <div className="relative flex justify-between">
              {surveyQuestions.map((q, idx) => {
                const isAnswered = !!ratings[q.id];
                const isCurrent = idx === currentStep;
                const isPast = idx < currentStep;
                
                return (
                  <button
                    key={idx}
                    onClick={() => setCurrentStep(idx)}
                    className={`w-7 h-7 rounded-full text-xs font-bold transition-all duration-300 flex items-center justify-center ${
                      isAnswered
                        ? 'bg-white text-purple-600 shadow-lg scale-100'
                        : isCurrent
                          ? 'bg-white text-purple-600 shadow-lg scale-110 ring-4 ring-white/30'
                          : isPast
                            ? 'bg-white/60 text-purple-600'
                            : 'bg-white/30 text-white hover:bg-white/50'
                    }`}
                  >
                    {isAnswered ? '✓' : idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[50vh]">
          {/* Current Question */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-purple-100 to-pink-100 border-2 border-purple-200 rounded-2xl flex items-center justify-center shadow-sm">
              <span className="text-4xl">{currentQuestion.icon}</span>
            </div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">
              Soru {currentStep + 1}/{surveyQuestions.length}
            </h3>
            <p className="text-gray-600 text-lg leading-relaxed">
              {currentQuestion.question}
            </p>
          </div>

          {/* Rating Buttons */}
          <div className="flex justify-center gap-3 mb-8">
            {[1, 2, 3, 4, 5].map((rating) => {
              const isSelected = ratings[currentQuestion.id] === rating;
              const isHovered = hoveredRating?.questionId === currentQuestion.id && hoveredRating?.rating === rating;
              
              return (
                <button
                  key={rating}
                  onClick={() => handleRating(currentQuestion.id, rating)}
                  onMouseEnter={() => setHoveredRating({ questionId: currentQuestion.id, rating })}
                  onMouseLeave={() => setHoveredRating(null)}
                  className={`group relative flex flex-col items-center gap-2 p-4 rounded-2xl transition-all duration-300 ${
                    isSelected
                      ? `bg-gradient-to-br ${ratingColors[rating - 1]} text-white scale-110 shadow-lg`
                      : 'bg-gray-50 hover:bg-gray-100 border-2 border-gray-200 hover:border-gray-300 hover:scale-105'
                  }`}
                >
                  <span className={`text-3xl transition-transform duration-300 ${isHovered || isSelected ? 'scale-125' : ''}`}>
                    {ratingEmojis[rating - 1]}
                  </span>
                  <span className={`text-xs font-medium ${isSelected ? 'text-white' : 'text-gray-600'}`}>
                    {ratingLabels[rating - 1]}
                  </span>
                  
                  {/* Rating number badge */}
                  <div className={`absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                    isSelected
                      ? 'bg-white text-purple-600 scale-100 shadow-md'
                      : 'bg-gray-200 text-gray-600 scale-75'
                  }`}>
                    {rating}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Quick Navigation */}
          <div className="flex justify-between items-center mb-6">
            <button
              onClick={() => setCurrentStep(prev => Math.max(0, prev - 1))}
              disabled={currentStep === 0}
              className={`px-4 py-2 rounded-xl font-medium transition-all duration-200 ${
                currentStep === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              ← Önceki
            </button>
            
            <span className="text-gray-500 text-sm font-medium">
              {answeredCount} / {surveyQuestions.length} tamamlandı
            </span>
            
            <button
              onClick={() => setCurrentStep(prev => Math.min(surveyQuestions.length - 1, prev + 1))}
              disabled={currentStep === surveyQuestions.length - 1}
              className={`px-4 py-2 rounded-xl font-medium transition-all duration-200 ${
                currentStep === surveyQuestions.length - 1
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Sonraki →
            </button>
          </div>

          {/* Additional Feedback */}
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
            <label className="block text-gray-700 text-sm font-medium mb-2">
              💬 Ek görüş ve önerileriniz (İsteğe bağlı)
            </label>
            <textarea
              value={additionalFeedback}
              onChange={(e) => setAdditionalFeedback(e.target.value)}
              placeholder="Deneyiminiz hakkında eklemek istediğiniz bir şey var mı?"
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              rows={3}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t border-gray-200 p-6 flex items-center justify-between">
          <button
            onClick={handleSkipSurvey}
            disabled={isSubmitting}
            className="px-6 py-3 bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 hover:text-gray-900 rounded-xl font-medium transition-all duration-200 disabled:opacity-50"
          >
            Anketi Atla
          </button>
          
          <button
            onClick={handleSubmit}
            disabled={!allQuestionsAnswered || isSubmitting}
            className={`px-8 py-3 rounded-xl font-semibold transition-all duration-300 flex items-center gap-2 ${
              allQuestionsAnswered && !isSubmitting
                ? 'bg-gradient-to-r from-emerald-500 to-green-500 text-white hover:from-emerald-600 hover:to-green-600 hover:scale-105 shadow-lg shadow-emerald-200'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isSubmitting ? (
              <>
                <span className="animate-spin">⏳</span>
                Kaydediliyor...
              </>
            ) : (
              <>
                <span>✓</span>
                Anketi Tamamla & Çıkış Yap
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DischargeSurveyModal;
