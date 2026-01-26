import Link from "next/link";
import Image from "next/image";
import { SiGithub,SiX,SiDiscord,SiTelegram } from '@icons-pack/react-simple-icons';

interface SocialLink {
  platform: string;
  url: string;
  icon: React.ReactNode;
  ariaLabel: string;
}

interface FooterProps {
  logoSvg?: React.ReactNode;
  socialLinks?: SocialLink[];
  currentYear?: number;
}

export function Footer({ 
  logoSvg, 
  socialLinks, 
  currentYear = new Date().getFullYear() 
}: FooterProps) {
  // Default social links if none provided
  const defaultSocialLinks: SocialLink[] = [
    {
      platform: "GitHub",
      url: "https://github.com/StabilityNexus",
      icon: <SiGithub className="h-5 w-5" />,
      ariaLabel: "Visit Maelstrom on GitHub"
    },
    {
      platform: "Discord",
      url: "https://discord.gg/BNsAtaX5",
      icon: <SiDiscord className="h-5 w-5" />,
      ariaLabel: "Join Maelstrom Discord community"
    },
    {
      platform: "Telegram",
      url: "https://t.me/StabilityNexus",
      icon: <SiTelegram className="h-5 w-5" />,
      ariaLabel: "Follow Maelstrom on Telegram"
    },
    {
      platform: "Twitter",
      url: "https://x.com/StabilityNexus",
      icon: <SiX className="h-5 w-5" />,
      ariaLabel: "Follow Maelstrom on Twitter"
    }
  ];

  const activeSocialLinks = socialLinks || defaultSocialLinks;

  const defaultLogo = (
    <div className="relative">
      <div className="w-15 h-15">
        <Image
          src="/stable.svg"
          alt="Stability Nexus"
          width={80}
          height={80}
          priority
        />
      </div>
      {/* Subtle glow effect */}
      <div className="absolute inset-0 w-10 h-10 bg-primary/20 transform rotate-12 rounded-lg blur-md -z-10"></div>
    </div>
  );

  const activeLogo = logoSvg || defaultLogo;

  return (
    <footer 
      className="relative w-screen px-5 border-t bg-gradient-to-b from-background to-muted/35 overflow-hidden"
      role="contentinfo"
      aria-label="Site footer"
    >
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(120,119,198,0.1),transparent_50%)]"></div>
      </div>
      
      <div className="w-full relative py-2 md:py-2 px-4 md:px-8">
        {/* Main footer content */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4">
          {/* Logo and branding section */}
          <div className="flex flex-col md:flex-row items-center gap-3">
            {/* Logo */}
            <div className="flex-shrink-0">
              {activeLogo}
            </div>
            
            {/* Branding text */}
            <div className="text-center md:text-left">
              <p className="text-lg font-bold text-foreground">
                The Stable Order
              </p>
            </div>
          </div>

          {/* Social media links */}
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:block">
              Follow us:
            </span>
            <div className="flex items-center gap-3">
              {activeSocialLinks.map((social) => (
                <Link
                  key={social.platform}
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative p-2 rounded-lg bg-muted/50 hover:bg-muted transition-all duration-300 hover:scale-110 focus:scale-110 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  aria-label={social.ariaLabel}
                >
                  {/* Icon */}
                  <div className="text-muted-foreground group-hover:text-primary transition-colors duration-300">
                    {social.icon}
                  </div>
                  
                  {/* Hover glow effect */}
                  <div className="absolute inset-0 rounded-lg bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-sm -z-10"></div>
                  
                  {/* Tooltip */}
                  <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-background border rounded text-xs text-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none whitespace-nowrap">
                    {social.platform}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
        
        {/* Bottom section - Copyright */}
        <div className="pt-3 flex justify-center border-t border-border">
          <p className="text-xs text-muted-foreground text-center md:text-left">
              © {currentYear} Stability Nexus. All rights reserved.
            </p>
        </div>
      </div>
    </footer>
  );
}