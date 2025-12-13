import React from 'react';
import FocusPreview from './FocusPreview';

export default { title: 'Components/FocusPreview' };

const movie = { id: 1, title: 'Preview Movie', overview: 'This is a preview overview.', backdrop_path: null, poster_path: null };

export const Default = () => <div style={{padding:20}}><FocusPreview movie={movie} /></div>;
