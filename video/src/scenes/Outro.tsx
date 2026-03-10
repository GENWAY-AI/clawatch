import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { COLORS, FONTS } from '../styles';

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo
  const logoSpring = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 80, mass: 1 },
  });
  const logoOpacity = interpolate(logoSpring, [0, 1], [0, 1]);
  const logoScale = interpolate(logoSpring, [0, 1], [0.8, 1]);

  // Terminal text typing
  const installCmd = 'npm install -g clawatch';
  const typeStart = 25;
  const charsVisible = Math.floor(
    interpolate(frame, [typeStart, typeStart + 40], [0, installCmd.length], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  );
  const typedCmd = installCmd.slice(0, charsVisible);
  const cursorVisible = frame > typeStart && Math.floor(frame / 8) % 2 === 0;

  // GitHub + URL
  const bottomSpring = spring({
    frame: frame - 60,
    fps,
    config: { damping: 14, stiffness: 100 },
  });
  const bottomOpacity = interpolate(bottomSpring, [0, 1], [0, 1]);
  const bottomY = interpolate(bottomSpring, [0, 1], [20, 0]);

  // Glow
  const glowIntensity = interpolate(
    frame,
    [0, 30, 60, 90],
    [0.1, 0.4, 0.3, 0.5],
    { extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.bg,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: 'absolute',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${COLORS.emeraldGlow}, transparent 70%)`,
          opacity: glowIntensity,
          filter: 'blur(80px)',
        }}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 30,
          zIndex: 1,
          opacity: logoOpacity,
          transform: `scale(${logoScale})`,
        }}
      >
        {/* Logo */}
        <div style={{
          width: 90,
          height: 90,
          borderRadius: 22,
          background: `linear-gradient(135deg, ${COLORS.emerald}, ${COLORS.emeraldDark})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 0 40px ${COLORS.emeraldGlow}`,
        }}>
          <span style={{
            fontSize: 46,
            fontWeight: 900,
            color: COLORS.white,
            fontFamily: FONTS.sans,
          }}>C</span>
        </div>

        <h1 style={{
          fontFamily: FONTS.sans,
          fontSize: 80,
          fontWeight: 800,
          color: COLORS.white,
          margin: 0,
          letterSpacing: -2,
        }}>
          Cla<span style={{ color: COLORS.emerald }}>Watch</span>
        </h1>

        {/* Terminal install */}
        <div style={{
          backgroundColor: '#0d0d0d',
          border: `1px solid ${COLORS.cardBorder}`,
          borderRadius: 12,
          padding: '16px 28px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <span style={{ fontFamily: FONTS.mono, fontSize: 24, color: COLORS.gray500 }}>$</span>
          <span style={{ fontFamily: FONTS.mono, fontSize: 24, color: COLORS.emerald }}>
            {typedCmd}
          </span>
          <span style={{
            display: 'inline-block',
            width: 2,
            height: 20,
            backgroundColor: COLORS.emerald,
            opacity: cursorVisible ? 1 : 0,
          }} />
        </div>

        {/* Bottom links */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            alignItems: 'center',
            marginTop: 10,
            opacity: bottomOpacity,
            transform: `translateY(${bottomY}px)`,
          }}
        >
          {/* GitHub */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 22px',
            borderRadius: 10,
            backgroundColor: COLORS.card,
            border: `1px solid ${COLORS.cardBorder}`,
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill={COLORS.white}>
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            <span style={{ fontFamily: FONTS.sans, fontSize: 20, color: COLORS.white, fontWeight: 500 }}>
              Star us on GitHub
            </span>
          </div>

          {/* Website */}
          <div style={{
            fontFamily: FONTS.sans,
            fontSize: 20,
            color: COLORS.gray400,
          }}>
            github.com/GENWAY-AI/clawatch
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
