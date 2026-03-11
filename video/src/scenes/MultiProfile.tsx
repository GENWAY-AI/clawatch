import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { COLORS, FONTS } from '../styles';
import { FeatureTitle } from '../components/FeatureTitle';
import { Card } from '../components/Card';

const profiles = [
  {
    name: 'Production',
    color: COLORS.red,
    agents: 12,
    cost: '$241.15',
    status: '3 alerts',
  },
  {
    name: 'Staging',
    color: COLORS.amber,
    agents: 5,
    cost: '$48.20',
    status: 'Healthy',
  },
  {
    name: 'Development',
    color: COLORS.emerald,
    agents: 8,
    cost: '$31.50',
    status: 'Healthy',
  },
];

export const MultiProfile: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Profile switch animation: cycles through profiles
  const activeIndex =
    frame < 60 ? 0 :
    frame < 100 ? 1 :
    2;

  // Dropdown animation
  const dropdownSpring = spring({
    frame: frame - 15,
    fps,
    config: { damping: 14, stiffness: 120 },
  });
  const dropdownOpacity = interpolate(dropdownSpring, [0, 1], [0, 1]);
  const dropdownY = interpolate(dropdownSpring, [0, 1], [-20, 0]);

  // Switch flash effect
  const flash1 = interpolate(frame, [58, 62, 68], [0, 0.15, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const flash2 = interpolate(frame, [98, 102, 108], [0, 0.15, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const activeProfile = profiles[activeIndex];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.bg,
        padding: '60px 70px',
        justifyContent: 'center',
      }}
    >
      {/* Flash overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: COLORS.emerald,
        opacity: flash1 + flash2,
      }} />

      <FeatureTitle title="Multi-Profile Support" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 30, alignItems: 'center' }}>
        {/* Profile switcher */}
        <div style={{ opacity: dropdownOpacity, transform: `translateY(${dropdownY}px)` }}>
          <div style={{
            fontFamily: FONTS.sans,
            fontSize: 16,
            color: COLORS.gray500,
            marginBottom: 10,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}>
            Active Profile
          </div>

          {/* Dropdown */}
          <div style={{
            width: 940,
            backgroundColor: COLORS.card,
            border: `1px solid ${COLORS.cardBorder}`,
            borderRadius: 14,
            overflow: 'hidden',
          }}>
            {profiles.map((profile, i) => {
              const isActive = i === activeIndex;
              return (
                <div
                  key={profile.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '16px 20px',
                    backgroundColor: isActive ? `${profile.color}10` : 'transparent',
                    borderLeft: isActive ? `3px solid ${profile.color}` : '3px solid transparent',
                  }}
                >
                  <div style={{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    backgroundColor: profile.color,
                    boxShadow: isActive ? `0 0 8px ${profile.color}` : 'none',
                  }} />
                  <span style={{
                    fontFamily: FONTS.sans,
                    fontSize: 20,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? COLORS.white : COLORS.gray500,
                  }}>
                    {profile.name}
                  </span>
                  {isActive && (
                    <span style={{
                      marginLeft: 'auto',
                      fontFamily: FONTS.sans,
                      fontSize: 14,
                      color: profile.color,
                    }}>
                      ●
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Profile data card */}
        <Card width={940} delay={25}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
            <div style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: activeProfile.color,
              boxShadow: `0 0 10px ${activeProfile.color}`,
            }} />
            <div style={{
              fontFamily: FONTS.sans,
              fontSize: 28,
              fontWeight: 700,
              color: COLORS.white,
            }}>
              {activeProfile.name}
            </div>
            <div style={{
              padding: '4px 10px',
              borderRadius: 6,
              backgroundColor: `${activeProfile.color}20`,
              fontFamily: FONTS.sans,
              fontSize: 14,
              color: activeProfile.color,
              fontWeight: 600,
            }}>
              {activeProfile.status}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 40, marginBottom: 24 }}>
            <div>
              <div style={{ fontFamily: FONTS.sans, fontSize: 14, color: COLORS.gray500, textTransform: 'uppercase', letterSpacing: 1 }}>
                Agents
              </div>
              <div style={{ fontFamily: FONTS.mono, fontSize: 42, fontWeight: 700, color: COLORS.white }}>
                {activeProfile.agents}
              </div>
            </div>
            <div>
              <div style={{ fontFamily: FONTS.sans, fontSize: 14, color: COLORS.gray500, textTransform: 'uppercase', letterSpacing: 1 }}>
                Total Cost
              </div>
              <div style={{ fontFamily: FONTS.mono, fontSize: 42, fontWeight: 700, color: COLORS.emerald }}>
                {activeProfile.cost}
              </div>
            </div>
          </div>

          {/* Mini agent list */}
          <div style={{
            padding: '16px 20px',
            backgroundColor: COLORS.bg,
            borderRadius: 10,
          }}>
            <div style={{ fontFamily: FONTS.sans, fontSize: 16, color: COLORS.gray500, marginBottom: 12 }}>
              Recent Agents
            </div>
            {['code-reviewer', 'api-builder', 'test-runner'].slice(0, activeIndex === 1 ? 2 : 3).map((agent) => (
              <div key={agent} style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '6px 0',
                borderBottom: `1px solid ${COLORS.gray800}`,
              }}>
                <span style={{ fontFamily: FONTS.mono, fontSize: 16, color: COLORS.gray300 }}>{agent}</span>
                <span style={{ fontFamily: FONTS.mono, fontSize: 16, color: COLORS.emerald }}>Active</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AbsoluteFill>
  );
};
