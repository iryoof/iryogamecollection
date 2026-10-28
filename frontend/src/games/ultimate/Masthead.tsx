interface MastheadProps {
  /** Linke Kopfzeile, z. B. der Name der Sammlung. */
  left: string
  /** Rechte Kopfzeile, z. B. der Lobby-Code als Ausgabennummer. */
  right: string
  title: string
  subtitle: string
}

export default function Masthead({ left, right, title, subtitle }: MastheadProps) {
  return (
    <header className="zt-masthead">
      <div className="zt-masthead-line">
        <span>{left}</span>
        <span>{right}</span>
      </div>
      <h1 className="zt-title">{title}</h1>
      <p className="zt-subtitle">{subtitle}</p>
    </header>
  )
}
