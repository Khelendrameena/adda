import { useState } from 'react';
import Home from './components/Home.jsx';
import Room from './components/Room.jsx';

export default function App() {
  const [roomState, setRoomState] = useState(null);
  const myName = localStorage.getItem('adda-name') || 'Guest';

  if (!roomState) {
    return <Home onEnter={(state) => setRoomState(state)} />;
  }
  return (
    <Room
      key={roomState.code}
      initial={roomState}
      myName={myName}
      onLeave={() => setRoomState(null)}
    />
  );
}
