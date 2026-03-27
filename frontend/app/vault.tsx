import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useVault, VaultEntry } from './contexts/VaultContext';

const CATEGORY_ICONS: Record<string, string> = {
  'Work': 'briefcase',
  'Social': 'account-group',
  'Finance': 'bank',
  'Home': 'home',
  'Email': 'email',
  'Other': 'folder',
};

export default function VaultScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { 
    entries, 
    isLocked, 
    isLoading, 
    unlockVault, 
    lockVault, 
    searchEntries,
    deleteEntry,
    authenticateForReveal 
  } = useVault();

  const [searchQuery, setSearchQuery] = useState('');
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    if (isLocked) {
      unlockVault();
    }
  }, []);

  const filteredEntries = searchEntries(searchQuery);

  const handleReveal = async (entry: VaultEntry) => {
    const authenticated = await authenticateForReveal();
    if (authenticated) {
      setRevealedIds(prev => new Set(prev).add(entry.id));
    }
  };

  const handleCopy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', 'Copied to clipboard');
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Entry',
      'Are you sure you want to delete this entry?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteEntry(id) },
      ]
    );
  };

  const getCategoryIcon = (category: string) => {
    return CATEGORY_ICONS[category] || 'folder';
  };

  const renderItem = ({ item }: { item: VaultEntry }) => {
    const isRevealed = revealedIds.has(item.id);
    
    return (
      <View style={styles.entryCard}>
        <View style={styles.entryLeft}>
          <View style={styles.iconContainer}>
            <MaterialCommunityIcons 
              name={getCategoryIcon(item.category) as any} 
              size={24} 
              color="#00E0C6" 
            />
          </View>
          <View style={styles.entryInfo}>
            <Text style={styles.entryTitle}>{item.title}</Text>
            <Text style={styles.entryUsername}>{item.username}</Text>
            <TouchableOpacity onPress={() => handleReveal(item)}>
              <Text style={styles.revealText}>
                {isRevealed ? item.password : '********'} • Tap to Reveal
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.entryRight}>
          {isRevealed && (
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => handleCopy(item.password || '')}
            >
              <Ionicons name="copy-outline" size={20} color="#00E0C6" />
            </TouchableOpacity>
          )}
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => handleDelete(item.id)}
          >
            <Ionicons name="trash-outline" size={20} color="#ff4d4f" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#00E0C6" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Secure Vault</Text>
        <TouchableOpacity onPress={lockVault} style={styles.lockButton}>
          <Ionicons name="lock-closed" size={24} color="#00E0C6" />
        </TouchableOpacity>
      </View>

      {/* Vault Status Card */}
      <View style={styles.statusCard}>
        <View style={styles.statusLeft}>
          <Ionicons name="shield-checkmark" size={28} color="#00E0C6" />
          <View style={styles.statusInfo}>
            <Text style={styles.statusTitle}>Vault Status</Text>
            <Text style={styles.statusValue}>{isLocked ? 'Locked' : 'Unlocked'}</Text>
          </View>
        </View>
        <TouchableOpacity 
          style={[styles.unlockButton, !isLocked && styles.lockedButton]}
          onPress={() => isLocked ? unlockVault() : lockVault()}
        >
          <Ionicons 
            name={isLocked ? 'lock-open' : 'lock-closed'} 
            size={20} 
            color="#fff" 
          />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#999" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search secure notes..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Recent Entries */}
      <View style={styles.entriesSection}>
        <Text style={styles.sectionTitle}>Recent Entries</Text>
        {filteredEntries.length > 0 ? (
          <FlatList
            data={filteredEntries}
            keyExtractor={(item, index) => item._id || item.id || `vault-${index}`}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          />
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="folder-open-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>No entries yet</Text>
            <Text style={styles.emptySubtext}>Tap + to add your first secure entry</Text>
          </View>
        )}
      </View>

      {/* FAB */}
      <TouchableOpacity 
        style={[styles.fab, { bottom: Math.max(insets.bottom, 20) + 80 }]}
        onPress={() => setShowAddModal(true)}
      >
        <Ionicons name="add" size={32} color="#fff" />
      </TouchableOpacity>

      {/* Bottom Navigation */}
      <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/home')}>
          <Ionicons name="home-outline" size={26} color="#888" />
          <Text style={styles.navText}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/journal')}>
          <Ionicons name="book-outline" size={26} color="#888" />
          <Text style={styles.navText}>Journal</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/avatar')}>
          <MaterialCommunityIcons name="account-voice" size={26} color="#888" />
          <Text style={styles.navText}>Avatar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/tasks')}>
          <Ionicons name="checkbox-outline" size={26} color="#888" />
          <Text style={styles.navText}>Tasks</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItemActive}>
          <Ionicons name="shield-checkmark" size={26} color="#00E0C6" />
          <Text style={[styles.navText, { color: '#00E0C6' }]}>Vault</Text>
        </TouchableOpacity>
      </View>

      {/* Add Entry Modal */}
      {showAddModal && (
        <AddVaultEntryModal 
          onClose={() => setShowAddModal(false)} 
        />
      )}
    </View>
  );
}

function AddVaultEntryModal({ onClose }: { onClose: () => void }) {
  const { addEntry } = useVault();
  const [title, setTitle] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [category, setCategory] = useState('Other');
  const [showPassword, setShowPassword] = useState(false);

  const categories = ['Work', 'Social', 'Finance', 'Home', 'Email', 'Other'];

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a title');
      return;
    }
    await addEntry({ title, username, password, category });
    onClose();
  };

  return (
    <View style={styles.modalOverlay}>
      <View style={[styles.modalContent, { paddingBottom: 20 }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Add New Entry</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color="#333" />
          </TouchableOpacity>
        </View>

        <Text style={styles.inputLabel}>Title</Text>
        <TextInput
          style={styles.modalInput}
          placeholder="Enter title"
          value={title}
          onChangeText={setTitle}
          placeholderTextColor="#999"
        />

        <Text style={styles.inputLabel}>Username / Email</Text>
        <TextInput
          style={styles.modalInput}
          placeholder="Enter username or email"
          value={username}
          onChangeText={setUsername}
          placeholderTextColor="#999"
          autoCapitalize="none"
        />

        <Text style={styles.inputLabel}>Password / Secret</Text>
        <View style={styles.passwordContainer}>
          <TextInput
            style={[styles.modalInput, { flex: 1 }]}
            placeholder="Enter password or secret"
            value={password}
            onChangeText={setPassword}
            placeholderTextColor="#999"
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity 
            style={styles.eyeButton}
            onPress={() => setShowPassword(!showPassword)}
          >
            <Ionicons 
              name={showPassword ? 'eye-off' : 'eye'} 
              size={24} 
              color="#999" 
            />
          </TouchableOpacity>
        </View>

        <Text style={styles.inputLabel}>Category</Text>
        <View style={styles.categoryContainer}>
          {categories.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[styles.categoryChip, category === cat && styles.categoryChipActive]}
              onPress={() => setCategory(cat)}
            >
              <MaterialCommunityIcons 
                name={getCategoryIcon(cat) as any} 
                size={16} 
                color={category === cat ? '#fff' : '#666'} 
              />
              <Text style={[styles.categoryChipText, category === cat && styles.categoryChipTextActive]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Save Entry</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function getCategoryIcon(category: string): string {
  return CATEGORY_ICONS[category] || 'folder';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFCFC',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  lockButton: {
    padding: 5,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusInfo: {
    marginLeft: 12,
  },
  statusTitle: {
    fontSize: 14,
    color: '#666',
  },
  statusValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  unlockButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#00E0C6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockedButton: {
    backgroundColor: '#ff4d4f',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    color: '#333',
  },
  entriesSection: {
    flex: 1,
    marginTop: 16,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  listContent: {
    paddingBottom: 200,
  },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  entryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E8F8F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  entryInfo: {
    flex: 1,
  },
  entryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  entryUsername: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  revealText: {
    fontSize: 13,
    color: '#00E0C6',
    marginTop: 4,
  },
  entryRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: 8,
    marginLeft: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#00E0C6',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#00E0C6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#fff',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  navItem: {
    alignItems: 'center',
    flex: 1,
  },
  navItemActive: {
    alignItems: 'center',
    flex: 1,
  },
  navText: {
    fontSize: 12,
    marginTop: 4,
    color: '#888',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 12,
  },
  modalInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#333',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eyeButton: {
    padding: 10,
    marginLeft: 8,
  },
  categoryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
  },
  categoryChipActive: {
    backgroundColor: '#00E0C6',
  },
  categoryChipText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 4,
  },
  categoryChipTextActive: {
    color: '#fff',
  },
  saveButton: {
    backgroundColor: '#00E0C6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
