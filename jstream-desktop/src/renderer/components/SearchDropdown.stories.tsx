import React from 'react';
import SearchDropdown from './SearchDropdown';

export default { title: 'Components/SearchDropdown' };

const sampleItems = [
  { id: 1, title: 'Movie A', poster_path: null, release_date: '2024-01-01', overview: 'Overview A' },
  { id: 2, title: 'Movie B', poster_path: null, release_date: '2023-05-05', overview: 'Overview B' }
];

export const Default = () => <div style={{width:360}}><SearchDropdown items={sampleItems} onSelect={(item)=>alert(item.title)} isOpen={true} /></div>;
