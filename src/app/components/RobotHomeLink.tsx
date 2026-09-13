import FooterRobotMark from './FooterRobotMark';

export default function RobotHomeLink({ className = '', inked = false }: { className?: string; inked?: boolean }) {
  return <a className={`ink-home-link ${className}`} href="/">
    <FooterRobotMark draggable={false} inked={inked} />
    <span>Home</span>
  </a>;
}
