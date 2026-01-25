import React, { useState } from 'react';
import { Box, Button } from '@chakra-ui/react';
import AccountPage from './AccountPage';
import SettingsPage from './SettingsPage';

export default function ProfilePage(){
  const [tab, setTab] = useState<'account'|'settings'>('account');
  return (
    <Box className="app-shell" pt="200px" px="40px">
      <div style={{display:'flex', gap:12, marginBottom:12}}>
        <Button variant={tab==='account' ? 'solid' : 'ghost'} onClick={()=>setTab('account')}>Account</Button>
        <Button variant={tab==='settings' ? 'solid' : 'ghost'} onClick={()=>setTab('settings')}>Settings</Button>
      </div>
      {tab==='account' ? <AccountPage /> : <SettingsPage />}
    </Box>
  );
}
