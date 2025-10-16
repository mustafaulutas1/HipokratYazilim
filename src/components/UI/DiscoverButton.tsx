import styles from '../../style'

const DiscoverButton = ({ styles: customStyles }: { styles: string }) => {
  return (
    <button type='button' className={`cursor-pointer ${styles.primaryButton} ${customStyles}`}>
      Platformu Keşfet
    </button>
  )
}

export default DiscoverButton
