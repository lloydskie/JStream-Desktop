import React, { useState, useEffect, useRef } from 'react';
import { Box } from '@chakra-ui/react';

interface ProfilePageProps {
  onSignOut?: () => void;
}

interface Account {
  id: string;
  name: string;
  avatar: string;
  avatarImage?: string;
  createdAt: string;
  isKid: boolean;
}

const avatarOptions = ['👤', '🧒', '👩', '👨', '👧', '👦', '🦸', '🦹', '🧑‍🎨', '🧑‍🚀', '🐱', '🐶', '🦊', '🐼', '🎬', '🎮', '🎵', '🌟'];

export default function ProfilePage({ onSignOut }: ProfilePageProps) {
  const [activeChip, setActiveChip] = useState<'overview' | 'security' | 'about'>('overview');
  const [currentAccount, setCurrentAccount] = useState<Account | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState('');
  const [tempAvatar, setTempAvatar] = useState('👤');
  const [tempAvatarImage, setTempAvatarImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinChangeError, setPinChangeError] = useState('');
  const [pinChangeSuccess, setPinChangeSuccess] = useState('');
  const [useRecoveryForPinChange, setUseRecoveryForPinChange] = useState(false);
  const [recoveryPinForChange, setRecoveryPinForChange] = useState('');
  
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmPin, setDeleteConfirmPin] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [useRecoveryForDelete, setUseRecoveryForDelete] = useState(false);
  const [recoveryPinForDelete, setRecoveryPinForDelete] = useState('');

  // Load current account on mount
  useEffect(() => {
    loadCurrentAccount();
  }, []);

  const loadCurrentAccount = async () => {
    try {
      const accountId = await (window as any).accounts?.current();
      if (accountId) {
        const accounts = await (window as any).accounts?.list();
        const account = accounts?.find((a: Account) => a.id === accountId);
        if (account) {
          // Load avatar image if exists
          const avatarImage = await (window as any).accounts?.loadAvatar(accountId);
          setCurrentAccount({ ...account, avatarImage });
          setTempName(account.name);
          setTempAvatar(account.avatar);
          setTempAvatarImage(avatarImage || null);
        }
      }
    } catch (e) {
      console.error('Failed to load current account', e);
    }
  };

  const handleAvatarImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUri = event.target?.result as string;
      setTempAvatarImage(dataUri);
      setTempAvatar(''); // Clear emoji when image is selected
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async () => {
    if (!currentAccount) return;
    
    try {
      // Save avatar image if uploaded
      if (tempAvatarImage) {
        await (window as any).accounts?.saveAvatar(currentAccount.id, tempAvatarImage);
        await (window as any).accounts?.updateProfile(currentAccount.id, { avatar: tempAvatar || '👤' });
      } else {
        await (window as any).accounts?.updateProfile(currentAccount.id, { avatar: tempAvatar || '👤' });
      }
      
      setCurrentAccount({ 
        ...currentAccount, 
        name: tempName, 
        avatar: tempAvatar || '👤',
        avatarImage: tempAvatarImage || undefined
      });
    } catch (e) {
      console.error('Failed to save profile', e);
    }
    setEditingName(false);
  };

  const handleChangePin = async () => {
    if (!currentAccount) return;
    setPinChangeError('');
    setPinChangeSuccess('');
    
    // Validate new PIN
    if (newPin.length < 4) {
      setPinChangeError('New PIN must be at least 4 digits');
      return;
    }
    if (newPin !== confirmPin) {
      setPinChangeError('New PINs do not match');
      return;
    }
    
    try {
      let verified = false;
      
      if (useRecoveryForPinChange) {
        // Use recovery PIN to reset
        if (recoveryPinForChange.length !== 6) {
          setPinChangeError('Recovery PIN must be 6 digits');
          return;
        }
        verified = await (window as any).accounts?.resetPin(currentAccount.id, recoveryPinForChange, newPin);
        if (!verified) {
          setPinChangeError('Invalid recovery PIN');
          setRecoveryPinForChange('');
          return;
        }
      } else {
        // Verify current PIN first
        if (!currentPin) {
          setPinChangeError('Please enter your current PIN');
          return;
        }
        const loginSuccess = await (window as any).accounts?.login(currentAccount.id, currentPin);
        if (!loginSuccess) {
          setPinChangeError('Current PIN is incorrect');
          setCurrentPin('');
          return;
        }
        // Now reset PIN using recovery flow (we'll verify with current PIN as if it were recovery)
        // Actually, we need to use the resetPin with a workaround - let's just use the login to verify
        // and then use resetPin with current PIN (which acts as recovery in this flow)
        verified = await (window as any).accounts?.resetPin(currentAccount.id, currentPin, newPin);
        if (!verified) {
          // If current PIN doesn't work as recovery, the account might not have one set properly
          // In this case we just update using login verification we already did
          setPinChangeError('PIN change failed. Try using recovery PIN.');
          return;
        }
      }
      
      // Success
      setPinChangeSuccess('PIN changed successfully!');
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setRecoveryPinForChange('');
      setUseRecoveryForPinChange(false);
      
      // Clear success message after 3 seconds
      setTimeout(() => setPinChangeSuccess(''), 3000);
    } catch (e) {
      console.error('Failed to change PIN', e);
      setPinChangeError('Failed to change PIN. Please try again.');
    }
  };

  const handleDeleteAccount = async () => {
    if (!currentAccount) return;
    setDeleteError('');
    
    try {
      let verified = false;
      
      if (useRecoveryForDelete) {
        // Verify using recovery PIN
        if (recoveryPinForDelete.length !== 6) {
          setDeleteError('Recovery PIN must be 6 digits');
          return;
        }
        // Try to reset PIN to verify recovery PIN is valid
        const tempPin = '000000';
        verified = await (window as any).accounts?.resetPin(currentAccount.id, recoveryPinForDelete, tempPin);
        if (!verified) {
          setDeleteError('Invalid recovery PIN');
          setRecoveryPinForDelete('');
          return;
        }
      } else {
        // Verify using current PIN
        if (!deleteConfirmPin) {
          setDeleteError('Please enter your PIN');
          return;
        }
        verified = await (window as any).accounts?.login(currentAccount.id, deleteConfirmPin);
        if (!verified) {
          setDeleteError('Incorrect PIN');
          setDeleteConfirmPin('');
          return;
        }
      }
      
      // Delete the account
      await (window as any).accounts?.delete(currentAccount.id);
      setShowDeleteModal(false);
      setDeleteConfirmPin('');
      setRecoveryPinForDelete('');
      setUseRecoveryForDelete(false);
      
      // Sign out to go back to welcome screen
      if (onSignOut) onSignOut();
    } catch (e) {
      console.error('Failed to delete account', e);
      setDeleteError('Failed to delete account. Please try again.');
    }
  };

  const handleSignOut = async () => {
    try {
      await (window as any).accounts?.logout();
      if (onSignOut) onSignOut();
    } catch (e) {
      console.error('Sign out failed:', e);
    }
  };

  const chipStyle = (isActive: boolean): React.CSSProperties => ({
    padding: '10px 24px', borderRadius: '9999px', fontWeight: 600, cursor: 'pointer',
    background: isActive ? '#dc2626' : '#374151', color: 'white', border: 'none', transition: 'all 0.2s',
  });

  const cardStyle: React.CSSProperties = { background: '#1f2937', borderRadius: '12px', padding: '32px', marginBottom: '24px' };
  const inputStyle: React.CSSProperties = { background: '#374151', border: 'none', borderRadius: '6px', padding: '12px 16px', color: 'white', width: '100%', maxWidth: '300px', fontSize: '16px' };
  const modalOverlayStyle: React.CSSProperties = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 };
  const modalContentStyle: React.CSSProperties = { background: '#1f2937', borderRadius: '12px', padding: '32px', maxWidth: '450px', width: '90%', color: 'white' };

  if (!currentAccount) {
    return (
      <Box className="app-shell" pt="200px" px="60px" pb="40px" minH="100vh" color="white">
        <div style={{ textAlign: 'center', color: '#9ca3af' }}>Loading account...</div>
      </Box>
    );
  }

  return (
    <Box className="app-shell" pt="200px" px="60px" pb="40px" minH="100vh" color="white">
      <div style={{ display: 'flex', gap: '16px', marginBottom: '32px' }}>
        <button style={chipStyle(activeChip === 'overview')} onClick={() => setActiveChip('overview')}>Overview</button>
        <button style={chipStyle(activeChip === 'security')} onClick={() => setActiveChip('security')}>Security</button>
        <button style={chipStyle(activeChip === 'about')} onClick={() => setActiveChip('about')}>About</button>
      </div>

      {activeChip === 'overview' && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px', color: 'white' }}>Account</h2>
          <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', marginBottom: '24px' }}>
            <div style={{ textAlign: 'center' }}>
              {/* Avatar display - image or emoji */}
              {tempAvatarImage ? (
                <img 
                  src={tempAvatarImage} 
                  style={{ 
                    width: '100px', 
                    height: '100px', 
                    borderRadius: '50%', 
                    objectFit: 'cover',
                    border: '3px solid #374151'
                  }} 
                  alt={currentAccount.name}
                />
              ) : (
                <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '48px' }}>{tempAvatar || '👤'}</div>
              )}
              
              {editingName && (
                <div style={{ marginTop: '12px' }}>
                  {/* Image upload */}
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    accept="image/*" 
                    onChange={handleAvatarImageSelect} 
                    style={{ display: 'none' }} 
                  />
                  <button 
                    onClick={() => fileInputRef.current?.click()} 
                    style={{ 
                      padding: '8px 16px', 
                      background: '#374151', 
                      color: 'white', 
                      border: '1px solid #4b5563', 
                      borderRadius: '6px', 
                      cursor: 'pointer',
                      marginBottom: '12px',
                      width: '100%'
                    }}
                  >
                    📷 Upload Photo
                  </button>
                  
                  {tempAvatarImage && (
                    <button 
                      onClick={() => { setTempAvatarImage(null); setTempAvatar('👤'); }} 
                      style={{ 
                        padding: '6px 12px', 
                        background: 'transparent', 
                        color: '#9ca3af', 
                        border: '1px solid #4b5563', 
                        borderRadius: '6px', 
                        cursor: 'pointer',
                        marginBottom: '12px',
                        width: '100%',
                        fontSize: '12px'
                      }}
                    >
                      Remove Photo
                    </button>
                  )}
                  
                  <p style={{ color: '#6b7280', fontSize: '12px', marginBottom: '8px' }}>Or choose an emoji:</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '200px', justifyContent: 'center' }}>
                    {avatarOptions.map(av => (
                      <button 
                        key={av} 
                        onClick={() => { setTempAvatar(av); setTempAvatarImage(null); }} 
                        style={{ 
                          padding: '4px 8px', 
                          background: tempAvatar === av && !tempAvatarImage ? '#dc2626' : '#374151', 
                          border: 'none', 
                          borderRadius: '4px', 
                          cursor: 'pointer', 
                          fontSize: '16px' 
                        }}
                      >
                        {av}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div>
              <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '4px' }}>Name</p>
              {editingName ? (
                <input type="text" value={tempName} onChange={(e) => setTempName(e.target.value)} style={inputStyle} />
              ) : (
                <p style={{ fontSize: '20px', fontWeight: 600, color: 'white' }}>{currentAccount.name}</p>
              )}
              {currentAccount.isKid && (
                <span style={{ fontSize: '12px', background: '#3b82f6', padding: '4px 12px', borderRadius: '9999px', marginTop: '8px', display: 'inline-block' }}>Kids Profile</span>
              )}
              <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '8px' }}>Member since {currentAccount.createdAt}</p>
              <div style={{ marginTop: '16px', display: 'flex', gap: '12px' }}>
                {editingName ? (
                  <>
                    <button onClick={handleSaveProfile} style={{ padding: '8px 16px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Save</button>
                    <button onClick={() => { setEditingName(false); setTempName(currentAccount.name); setTempAvatar(currentAccount.avatar); setTempAvatarImage(currentAccount.avatarImage || null); }} style={{ padding: '8px 16px', background: 'transparent', color: 'white', border: '1px solid #4b5563', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
                  </>
                ) : (
                  <button onClick={() => setEditingName(true)} style={{ padding: '8px 16px', background: 'transparent', color: 'white', border: '1px solid #4b5563', borderRadius: '6px', cursor: 'pointer' }}>Edit Profile</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeChip === 'security' && (
        <>
          <div style={cardStyle}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px', color: 'white' }}>Change PIN</h2>
            <div style={{ maxWidth: '400px' }}>
              {!useRecoveryForPinChange ? (
                <div style={{ marginBottom: '16px' }}>
                  <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '4px' }}>Current PIN</p>
                  <input 
                    type="password" 
                    maxLength={8} 
                    value={currentPin} 
                    onChange={(e) => { setCurrentPin(e.target.value.replace(/\D/g, '')); setPinChangeError(''); }} 
                    style={inputStyle} 
                    placeholder="••••" 
                  />
                  <button 
                    onClick={() => setUseRecoveryForPinChange(true)}
                    style={{ 
                      background: 'transparent', 
                      border: 'none', 
                      color: '#60a5fa', 
                      cursor: 'pointer', 
                      fontSize: '14px', 
                      marginTop: '8px',
                      textDecoration: 'underline'
                    }}
                  >
                    Forgot PIN? Use Recovery PIN
                  </button>
                </div>
              ) : (
                <div style={{ marginBottom: '16px' }}>
                  <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '4px' }}>Recovery PIN (6 digits)</p>
                  <input 
                    type="password" 
                    maxLength={6} 
                    value={recoveryPinForChange} 
                    onChange={(e) => { setRecoveryPinForChange(e.target.value.replace(/\D/g, '')); setPinChangeError(''); }} 
                    style={inputStyle} 
                    placeholder="••••••" 
                  />
                  <button 
                    onClick={() => { setUseRecoveryForPinChange(false); setRecoveryPinForChange(''); }}
                    style={{ 
                      background: 'transparent', 
                      border: 'none', 
                      color: '#60a5fa', 
                      cursor: 'pointer', 
                      fontSize: '14px', 
                      marginTop: '8px',
                      textDecoration: 'underline'
                    }}
                  >
                    ← Use Current PIN instead
                  </button>
                </div>
              )}
              <div style={{ marginBottom: '16px' }}>
                <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '4px' }}>New PIN (at least 4 digits)</p>
                <input 
                  type="password" 
                  maxLength={8} 
                  value={newPin} 
                  onChange={(e) => { setNewPin(e.target.value.replace(/\D/g, '')); setPinChangeError(''); }} 
                  style={inputStyle} 
                  placeholder="••••" 
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '4px' }}>Confirm New PIN</p>
                <input 
                  type="password" 
                  maxLength={8} 
                  value={confirmPin} 
                  onChange={(e) => { setConfirmPin(e.target.value.replace(/\D/g, '')); setPinChangeError(''); }} 
                  style={inputStyle} 
                  placeholder="••••" 
                />
              </div>
              {pinChangeError && (
                <p style={{ color: '#f87171', fontSize: '14px', marginBottom: '16px', padding: '12px', background: 'rgba(248, 113, 113, 0.1)', borderRadius: '8px' }}>
                  {pinChangeError}
                </p>
              )}
              {pinChangeSuccess && (
                <p style={{ color: '#4ade80', fontSize: '14px', marginBottom: '16px', padding: '12px', background: 'rgba(74, 222, 128, 0.1)', borderRadius: '8px' }}>
                  ✓ {pinChangeSuccess}
                </p>
              )}
              <button onClick={handleChangePin} style={{ padding: '10px 20px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Change PIN</button>
            </div>
          </div>

          <div style={cardStyle}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px', color: 'white' }}>Sign Out</h2>
            <p style={{ color: '#9ca3af', marginBottom: '16px' }}>Sign out of your account to switch to a different account or create a new one.</p>
            <button onClick={handleSignOut} style={{ padding: '10px 20px', background: '#374151', color: 'white', border: '1px solid #4b5563', borderRadius: '6px', cursor: 'pointer' }}>Sign Out</button>
          </div>

          <div style={cardStyle}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px', color: 'white' }}>Delete Account</h2>
            <p style={{ color: '#9ca3af', marginBottom: '16px' }}>Permanently delete your account and all associated data. This action cannot be undone.</p>
            <button onClick={() => setShowDeleteModal(true)} style={{ padding: '10px 20px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Delete Account</button>
          </div>
        </>
      )}

      {activeChip === 'about' && (
        <>
          <div style={cardStyle}>
            <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ 
                width: '120px', 
                height: '120px', 
                borderRadius: '16px', 
                background: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <img src="https://quijano.pages.dev/store/files/assets/jstreamv2/original-logo-backup.png" alt="JStream" style={{ width: '100%', height: 'auto', objectFit: 'contain' }} />
              </div>
              <div style={{ flex: 1, minWidth: '280px' }}>
                <h3 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '4px', color: 'white' }}>JStream</h3>
                <p style={{ color: '#dc2626', fontSize: '16px', fontWeight: 500, marginBottom: '16px' }}>Stream Freely, Privately, and Securely</p>
                <p style={{ color: '#d1d5db', lineHeight: 1.8, marginBottom: '20px', fontSize: '15px' }}>
                  Enjoy your favorite movies and TV shows with no ads, no VPN required, and no data collection.
                  JStream is a secure, private streaming experience designed for pure entertainment — no trackers, 
                  no accounts required, just instant streaming right from your device.
                </p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
                  <span style={{ background: 'rgba(220, 38, 38, 0.15)', border: '1px solid rgba(220, 38, 38, 0.3)', padding: '6px 14px', borderRadius: '9999px', fontSize: '12px', color: '#f87171' }}>Ad-Free</span>
                  <span style={{ background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.3)', padding: '6px 14px', borderRadius: '9999px', fontSize: '12px', color: '#4ade80' }}>No VPN Required</span>
                  <span style={{ background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '6px 14px', borderRadius: '9999px', fontSize: '12px', color: '#60a5fa' }}>100% Private</span>
                </div>
                <p style={{ color: '#6b7280', fontSize: '13px' }}>Version 1.0.0 • Built with Electron, React & TypeScript</p>
              </div>
            </div>
          </div>

          <div style={cardStyle}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px', color: 'white' }}>Key Features</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
              {[
                { icon: '🚫', title: 'Ad-Free Streaming', desc: 'Uninterrupted viewing experience' },
                { icon: '🔒', title: 'No VPN Needed', desc: 'Stream directly without hassle' },
                { icon: '🛡️', title: 'Privacy First', desc: 'Your data stays on your device' },
                { icon: '🎬', title: 'Movies & Shows', desc: 'Thousands of titles to explore' },
                { icon: '👥', title: 'Multiple Profiles', desc: 'Personalized for everyone' },
                { icon: '⚡', title: 'Instant Access', desc: 'No registration required' },
              ].map((feature, idx) => (
                <div key={idx} style={{ background: '#374151', borderRadius: '12px', padding: '20px' }}>
                  <div style={{ fontSize: '28px', marginBottom: '12px' }}>{feature.icon}</div>
                  <h4 style={{ fontWeight: 600, color: 'white', marginBottom: '4px', fontSize: '14px' }}>{feature.title}</h4>
                  <p style={{ color: '#9ca3af', fontSize: '12px' }}>{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div style={cardStyle}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px', color: 'white' }}>Meet the Developer</h2>
            <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <img 
                src="https://quijano.pages.dev/assets/images/me_updated.jpg" 
                alt="John Lloyd Quijano"
                style={{ 
                  width: '100px', 
                  height: '100px', 
                  borderRadius: '50%', 
                  objectFit: 'cover',
                  boxShadow: '0 4px 20px rgba(59, 130, 246, 0.4)',
                  flexShrink: 0,
                  border: '3px solid #3b82f6'
                }}
              />
              <div style={{ flex: 1, minWidth: '250px' }}>
                <h3 style={{ fontSize: '22px', fontWeight: 'bold', color: 'white', marginBottom: '2px' }}>John Lloyd Quijano</h3>
                <p style={{ color: '#60a5fa', fontSize: '14px', marginBottom: '12px' }}>@lloydskie • he/him</p>
                <p style={{ color: '#d1d5db', fontSize: '14px', lineHeight: 1.7, marginBottom: '16px' }}>
                  Computer Engineer from the Philippines with a passion for cybersecurity, embedded systems, and full-stack development. 
                  Interested in network monitoring, OSINT, and building secure applications. Love working with Linux, Windows, and exploring new technologies.
                </p>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <button 
                    onClick={() => { console.log('GitHub clicked'); (window as any).openExternal?.url('https://github.com/lloydskie'); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#374151', padding: '8px 14px', borderRadius: '8px', color: '#d1d5db', border: 'none', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#4b5563'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#374151'; }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                    GitHub
                  </button>
                  <button 
                    onClick={() => { console.log('Portfolio clicked'); (window as any).openExternal?.url('https://quijano.pages.dev/'); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#374151', padding: '8px 14px', borderRadius: '8px', color: '#d1d5db', border: 'none', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#4b5563'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#374151'; }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
                    Portfolio
                  </button>
                  <button 
                    onClick={() => { console.log('LinkedIn clicked'); (window as any).openExternal?.url('https://www.linkedin.com/in/john-lloyd-quijano/'); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#374151', padding: '8px 14px', borderRadius: '8px', color: '#d1d5db', border: 'none', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#4b5563'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#374151'; }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
                    LinkedIn
                  </button>
                  <button 
                    onClick={() => { console.log('Facebook clicked'); (window as any).openExternal?.url('https://www.facebook.com/jlqofficial/'); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#374151', padding: '8px 14px', borderRadius: '8px', color: '#d1d5db', border: 'none', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#4b5563'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#374151'; }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z"/></svg>
                    Facebook
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div style={cardStyle}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px', color: 'white' }}>Acknowledgements</h2>
            <p style={{ color: '#9ca3af', lineHeight: 1.7, marginBottom: '16px' }}>
              This application uses data provided by TMDB (The Movie Database). 
              All movie and TV show information, images, and metadata are sourced from TMDB's API.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <img 
                src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg" 
                alt="TMDB Logo" 
                style={{ height: '17px', opacity: 0.8 }}
              />
              <span style={{ color: '#6b7280', fontSize: '12px' }}>This product uses the TMDB API but is not endorsed or certified by TMDB.</span>
            </div>
          </div>

          <div style={{ textAlign: 'center', color: '#6b7280', fontSize: '13px', marginTop: '32px', paddingBottom: '20px' }}>
            <p style={{ marginBottom: '8px' }}>Experience freedom in streaming — simple, safe, and limitless.</p>
            <p>© 2026 JStream. Made with ❤️ by John Lloyd Quijano</p>
          </div>
        </>
      )}

      {/* Delete Account Confirmation Modal */}
      {showDeleteModal && (
        <div style={modalOverlayStyle} onClick={() => { setShowDeleteModal(false); setUseRecoveryForDelete(false); setRecoveryPinForDelete(''); setDeleteError(''); }}>
          <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px' }}>Delete Account</h3>
            <p style={{ color: '#9ca3af', marginBottom: '24px' }}>
              Are you sure you want to delete your account? This will permanently remove all your data including favorites, watch history, and preferences.
            </p>
            {!useRecoveryForDelete ? (
              <div>
                <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Enter your PIN to confirm:</p>
                <input
                  type="password"
                  maxLength={8}
                  value={deleteConfirmPin}
                  onChange={(e) => { setDeleteConfirmPin(e.target.value.replace(/\D/g, '')); setDeleteError(''); }}
                  style={{ ...inputStyle, marginBottom: '12px' }}
                  placeholder="Enter PIN"
                />
                <button 
                  onClick={() => setUseRecoveryForDelete(true)}
                  style={{ 
                    background: 'transparent', 
                    border: 'none', 
                    color: '#60a5fa', 
                    cursor: 'pointer', 
                    fontSize: '14px', 
                    marginBottom: '24px',
                    textDecoration: 'underline',
                    display: 'block'
                  }}
                >
                  Forgot PIN? Use Recovery PIN
                </button>
              </div>
            ) : (
              <div>
                <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Enter your Recovery PIN (6 digits):</p>
                <input
                  type="password"
                  maxLength={6}
                  value={recoveryPinForDelete}
                  onChange={(e) => { setRecoveryPinForDelete(e.target.value.replace(/\D/g, '')); setDeleteError(''); }}
                  style={{ ...inputStyle, marginBottom: '12px' }}
                  placeholder="••••••"
                />
                <button 
                  onClick={() => { setUseRecoveryForDelete(false); setRecoveryPinForDelete(''); }}
                  style={{ 
                    background: 'transparent', 
                    border: 'none', 
                    color: '#60a5fa', 
                    cursor: 'pointer', 
                    fontSize: '14px', 
                    marginBottom: '24px',
                    textDecoration: 'underline',
                    display: 'block'
                  }}
                >
                  ← Use Regular PIN instead
                </button>
              </div>
            )}
            {deleteError && (
              <p style={{ color: '#f87171', fontSize: '14px', marginBottom: '16px', padding: '12px', background: 'rgba(248, 113, 113, 0.1)', borderRadius: '8px' }}>
                {deleteError}
              </p>
            )}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowDeleteModal(false); setDeleteConfirmPin(''); setUseRecoveryForDelete(false); setRecoveryPinForDelete(''); setDeleteError(''); }} style={{ padding: '10px 20px', background: 'transparent', color: 'white', border: '1px solid #4b5563', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleDeleteAccount} style={{ padding: '10px 20px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Delete Forever</button>
            </div>
          </div>
        </div>
      )}
    </Box>
  );
}
