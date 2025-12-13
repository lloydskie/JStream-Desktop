import React from 'react';
import Row from './Row';

export default { title: 'Components/Row' };

const movies = Array.from({length:8}).map((_,i)=>({ id: i+1, title: `Sample ${i+1}`, poster_path: null }));

export const Default = () => <div style={{padding:20}}><Row title="Sample Row" movies={movies} onSelect={(id)=>alert(id)} /></div>;
