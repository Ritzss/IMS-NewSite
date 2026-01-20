import './globals.css'

export const metadata = {
  title: 'Vastra IMS',
  description: 'A simple Inventory Management System',
   icons: {
    icon: "\favicon.ico",
  },
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