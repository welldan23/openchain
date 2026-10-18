import { detectImageType, isTimeZone, parseProfileUpdate, validateAvatar } from './profile-input.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);

describe('ubah profil', () => {
  it('nama dirapikan, zona waktu harus nama IANA yang sah', () => {
    expect(parseProfileUpdate({ displayName: '  Rina A.  ', timezone: 'Asia/Makassar' })).toEqual({ displayName: 'Rina A.', timezone: 'Asia/Makassar' });
    expect(parseProfileUpdate({ timezone: 'UTC' })).toEqual({ timezone: 'UTC' });
    expect(isTimeZone('Asia/Jayapura')).toBe(true);
    expect(() => parseProfileUpdate({ timezone: 'WIB' })).toThrow('Zona waktu tidak dikenal');
    expect(() => parseProfileUpdate({ displayName: 'R' })).toThrow('2–60');
    expect(() => parseProfileUpdate({ email: 'baru@contoh.id' })).toThrow('Tidak ada yang diubah');
  });

  it('jenis foto dari isi berkas, bukan dari nama atau label', () => {
    expect(detectImageType(PNG)).toBe('image/png');
    expect(detectImageType(JPEG)).toBe('image/jpeg');
    expect(detectImageType(WEBP)).toBe('image/webp');
    expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(detectImageType(Buffer.from('GIF89a'))).toBeNull();
    expect(validateAvatar(PNG)).toEqual({ data: PNG, contentType: 'image/png' });
    expect(() => validateAvatar(undefined)).toThrow('Pilih berkas foto');
    expect(() => validateAvatar(Buffer.from('<svg/>'))).toThrow('PNG, JPG, atau WebP');
    expect(() => validateAvatar(Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]))).toThrow('maksimal 2 MB');
  });
});
