import Image from 'next/image'

export default function AuthLogo() {
  return (
    <div className="flex flex-col items-center gap-1 mb-6">
      <Image
        src="/images/navy-white.png"
        alt="Navy Training"
        width={130}
        height={50}
        className="object-contain"
        priority
      />
    </div>
  )
}