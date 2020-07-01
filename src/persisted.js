import store from '@/store';

export default function getPersistedData(callback) {
  return callback({ store });
}
