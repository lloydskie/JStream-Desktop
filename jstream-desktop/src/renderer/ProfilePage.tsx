import React, { useState } from 'react';
import { Box, Button } from '@chakra-ui/react';
import AccountPage from './AccountPage';
import SettingsPage from './SettingsPage';

export default function ProfilePage(){
  const [tab, setTab] = useState<'account'|'settings'>('account');
  return (
    <Box className="app-shell">
      <div className="brand" style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
        <div className="logo">JStream</div>
        <div className="title" style={{fontSize:18,fontWeight:700}}>Your Library</div>
      </div>
      <div style={{display:'flex', gap:12, marginBottom:12}}>
        <Button variant={tab==='account' ? 'solid' : 'ghost'} onClick={()=>setTab('account')}>Account</Button>
        <Button variant={tab==='settings' ? 'solid' : 'ghost'} onClick={()=>setTab('settings')}>Settings</Button>
      </div>
      {tab==='account' ? <AccountPage /> : <SettingsPage />}
    </Box>
  );
}
