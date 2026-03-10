import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { COLORS, FONTS } from '../styles';
import { FeatureTitle } from '../components/FeatureTitle';
import { Card } from '../components/Card';

const TimelineBar: React.FC<{
  agent: string;
  color: string;
  widthPct: number;
  offsetPct: number;
  delay: number;
}> = ({ agent, color, widthPct, offsetPct, delay }) => {
  const frame = useCurrentFrame();

  const barWidth = interpolate(frame, [delay, delay + 40], [0, widthPct], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
      <div style={{ width: 120, fontFamily: FONTS.mono, fontSize: 14, color: COLORS.gray400, textAlign: 'right' }}>
        {agent}
      </div>
      <div style={{ flex: 1, height: 28, backgroundColor: COLORS.gray700, borderRadius: 6, position: 'relative', overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            left: `${offsetPct}%`,
            width: `${barWidth}%`,
            height: '100%',
            backgroundColor: color,
            borderRadius: 6,
            opacity: 0.85,
          }}
        />
      </div>
    </div>
  );
};

export const UnifiedSessions: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.bg,
        padding: '60px 70px',
        justifyContent: 'center',
      }}
    >
      <FeatureTitle title="Unified Session View" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Project cards */}
        <div style={{ display: 'flex', flexDirection: 'row', gap: 16 }}>
          {[
            { name: 'clawatch-api', sessions: 12, cost: '$48.20', agents: 3 },
            { name: 'frontend-v2', sessions: 8, cost: '$31.50', agents: 2 },
            { name: 'docs-update', sessions: 4, cost: '$12.80', agents: 1 },
          ].map((project, i) => (
            <Card key={project.name} width={290} delay={10 + i * 15}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontFamily: FONTS.sans, fontSize: 20, fontWeight: 600, color: COLORS.white }}>
                  {project.name}
                </div>
                <div style={{
                  padding: '3px 10px',
                  borderRadius: 6,
                  backgroundColor: `${COLORS.emerald}15`,
                  fontFamily: FONTS.mono,
                  fontSize: 14,
                  color: COLORS.emerald,
                }}>
                  {project.agents} agents
                </div>
              </div>
              <div style={{ display: 'flex', gap: 24 }}>
                <div>
                  <div style={{ fontFamily: FONTS.sans, fontSize: 13, color: COLORS.gray500, textTransform: 'uppercase', letterSpacing: 1 }}>Sessions</div>
                  <div style={{ fontFamily: FONTS.mono, fontSize: 26, fontWeight: 700, color: COLORS.white }}>{project.sessions}</div>
                </div>
                <div>
                  <div style={{ fontFamily: FONTS.sans, fontSize: 13, color: COLORS.gray500, textTransform: 'uppercase', letterSpacing: 1 }}>Total Cost</div>
                  <div style={{ fontFamily: FONTS.mono, fontSize: 26, fontWeight: 700, color: COLORS.emerald }}>{project.cost}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Timeline */}
        <Card width={'100%'} delay={20} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontFamily: FONTS.sans, fontSize: 20, fontWeight: 600, color: COLORS.gray300, marginBottom: 20 }}>
            Session Timeline
          </div>

          <TimelineBar agent="code-reviewer" color={COLORS.emerald} widthPct={60} offsetPct={5} delay={40} />
          <TimelineBar agent="api-builder" color={COLORS.blue} widthPct={45} offsetPct={20} delay={55} />
          <TimelineBar agent="test-runner" color={COLORS.purple} widthPct={30} offsetPct={40} delay={70} />
          <TimelineBar agent="docs-writer" color={COLORS.amber} widthPct={50} offsetPct={30} delay={85} />

          {/* Time axis */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, paddingLeft: 124 }}>
            {['9:00', '10:00', '11:00', '12:00', '13:00'].map((t) => (
              <span key={t} style={{ fontFamily: FONTS.mono, fontSize: 13, color: COLORS.gray600 }}>{t}</span>
            ))}
          </div>

          {/* Cost summary */}
          <div style={{
            marginTop: 24,
            padding: '14px 18px',
            backgroundColor: COLORS.bg,
            borderRadius: 10,
            display: 'flex',
            justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontFamily: FONTS.sans, fontSize: 13, color: COLORS.gray500 }}>TOTAL SESSIONS</div>
              <div style={{ fontFamily: FONTS.mono, fontSize: 24, fontWeight: 700, color: COLORS.white }}>24</div>
            </div>
            <div>
              <div style={{ fontFamily: FONTS.sans, fontSize: 13, color: COLORS.gray500 }}>TOTAL COST</div>
              <div style={{ fontFamily: FONTS.mono, fontSize: 24, fontWeight: 700, color: COLORS.emerald }}>$92.50</div>
            </div>
            <div>
              <div style={{ fontFamily: FONTS.sans, fontSize: 13, color: COLORS.gray500 }}>AVG / SESSION</div>
              <div style={{ fontFamily: FONTS.mono, fontSize: 24, fontWeight: 700, color: COLORS.white }}>$3.85</div>
            </div>
          </div>
        </Card>
      </div>
    </AbsoluteFill>
  );
};
