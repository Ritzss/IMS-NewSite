import './globals.css'

export const metadata = {
  title: 'Vastra IMS',
  description: 'A simple Inventory Management System',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  )
}