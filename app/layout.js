import './globals.css'

export const metadata = {
  title: 'Brass IMS',
  description: 'A simple Inventory Management System',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body  cz-shortcut-listen="true">
        {children}
      </body>
    </html>
  )
}