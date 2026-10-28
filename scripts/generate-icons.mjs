import sharp from 'sharp'
import { resolve } from 'node:path'
for (const [size, filename] of [[192, 'icon-192.png'], [512, 'icon-512.png'], [180, 'apple-touch-icon.png']]) {
  await sharp(resolve('public/favicon.svg')).resize(size, size).flatten({ background: '#345e48' }).png().toFile(resolve(`public/${filename}`))
}
console.log('PWA icons generated from the Tend mark.')
