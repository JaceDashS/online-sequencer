import React from 'react';
import styles from './Mixer.module.css';
import MixerChannel from './MixerChannel';
import MasterChannel from './MasterChannel';
import { getProject } from '../../store/projectStore';

interface MixerProps {
  selectedTrackId?: string | null;
  onTrackSelect?: (trackId: string | null) => void;
}

const Mixer: React.FC<MixerProps> = ({ selectedTrackId, onTrackSelect }) => {
  const project = getProject();
  const tracks = project.tracks;

  const handleChannelClick = (trackId: string) => {
    if (onTrackSelect) {
      // 같은 트랙을 다시 클릭해도 포커스 유지 (null로 설정하지 않음)
      if (selectedTrackId !== trackId) {
        onTrackSelect(trackId);
      }
      // selectedTrackId === trackId인 경우는 아무것도 하지 않음 (포커스 유지)
    }
  };

  return (
    <div className={styles.mixer}>
      <div className={styles.mixerChannels}>
        {tracks.map((track) => (
          <MixerChannel
            key={track.id}
            track={track}
            isSelected={selectedTrackId === track.id}
            onClick={() => handleChannelClick(track.id)}
          />
        ))}
      </div>
      <div className={styles.masterChannelWrapper}>
        <MasterChannel 
          isSelected={selectedTrackId === 'master'}
          onClick={() => {
            if (onTrackSelect) {
              // 같은 마스터를 다시 클릭해도 포커스 유지 (null로 설정하지 않음)
              if (selectedTrackId !== 'master') {
                onTrackSelect('master');
              }
              // selectedTrackId === 'master'인 경우는 아무것도 하지 않음 (포커스 유지)
            }
          }}
        />
      </div>
    </div>
  );
};

export default Mixer;
