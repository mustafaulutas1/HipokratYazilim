import { useState } from 'react'
import {
  HeroSection,
  StatsSection,
  FeaturesSection,
  PromotionSection,
  DiscoverySection,
  CTASection,
  TestimonialSection
} from '../components/Landing'
import styles from '../style'
import ScrollAnimation from '../components/UI/ScrollAnimation'
import RobotModal from '../components/UI/RobotModal/RobotModal'
import { forceLogoutService } from '../services/forceLogoutService'
import { useAuth } from '../context/AuthContext'

const Home = () => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const { user } = useAuth()

  const handleSignOutAllUsers = async () => {
    if (!confirm('⚠️ Are you sure you want to sign out ALL users from all devices? This action cannot be undone.')) {
      return
    }

    setIsSigningOut(true)
    try {
      await forceLogoutService.triggerForceLogout(user?.email || 'admin', 'Manual sign out all users')
      alert('✅ All users have been signed out successfully!')
    } catch (error) {
      console.error('Error signing out all users:', error)
      alert('❌ Failed to sign out all users. Please try again.')
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <>
      {/* Sign Out All Users Button - Fixed at top */}
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={handleSignOutAllUsers}
          disabled={isSigningOut}
          className="px-6 py-3 rounded-lg font-semibold text-sm bg-red-600 text-white shadow-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 flex items-center gap-2"
        >
          {isSigningOut ? (
            <>
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Signing Out...
            </>
          ) : (
            <>
              🚪 Sign Out All Users
            </>
          )}
        </button>
      </div>

      <HeroSection onShowModal={() => setIsModalOpen(true)} />
      <div className={`bg-gradient-to-br from-slate-50 to-blue-50 ${styles.paddingX} ${styles.flexStart} relative z-10`}>
        <div className={`${styles.boxWidth} space-y-24 mb-24`}>
          <ScrollAnimation>
            <StatsSection />
          </ScrollAnimation>

          <ScrollAnimation>
            <FeaturesSection />
          </ScrollAnimation>
          
          <ScrollAnimation>
            <PromotionSection />
          </ScrollAnimation>
          
          <ScrollAnimation>
            <DiscoverySection />
          </ScrollAnimation>
          
          <ScrollAnimation>
            <TestimonialSection />
          </ScrollAnimation>
          
          <ScrollAnimation>
            <CTASection />
          </ScrollAnimation>
        </div>
      </div>

      <RobotModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  )
}

export default Home 