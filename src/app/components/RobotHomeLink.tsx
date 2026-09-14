export default function RobotHomeLink({ className = '' }: { className?: string }) {
  return <a className={`ink-home-link ${className}`} href="/">
    <span>Home</span>
  </a>;
}
