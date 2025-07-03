# ComposeWrite - Your Personal Book Writing Assistant

This is a Next.js project bootstrapped with `create-next-app`, designed as a personal book writing assistant.

## Tech Stack

- **Framework:** Next.js (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **UI Components:** ShadCN UI
- **Linting:** ESLint
- **Generative AI:** Genkit
- **Local Development Bundler:** Turbopack


## Getting Started

First, install the dependencies:
```bash
npm install
```

Then, run the development server:
```bash
npm run dev
```

Open [http://localhost:9003](http://localhost:9003) (or the port specified in your `package.json` if different) with your browser to see the result.

You can start editing the page by modifying `src/app/page.tsx`. The page auto-updates as you edit the file.


## Key Features (as per PRD)

-   **Book Structure:** Left sidebar with a hierarchical tree view (chapters, subchapters). Supports creating, editing, reordering (drag & drop), and toggling visibility.
-   **Content Editor:** Central content editor based on Suneditor-react replaced/enhanced with `react-draft-wysiwyg` or similar for custom image handling) with support for H1-H6 headings, text editing, and image uploads.
-   **Table of Contents:** Right sidebar displaying the TOC for the currently selected chapter, reflecting heading hierarchy (H1-H6). Supports toggling visibility and dynamic reordering.
-   **Export Options:** Functionality to export the book in various formats (Word, HTML).
-   **AI Integration:** Utilizes Genkit for AI-powered features.

## Styling Guidelines

-   **Primary color:** Deep purple (`#673AB7`)
-   **Background color:** Light gray (`#F5F5F5`), subtly tinted with purple.
-   **Accent color:** Teal (`#009688`)
-   **Body text font:** 'Literata' (serif)
-   **Headline font:** 'Belleza' (sans-serif)
-   **Icons:** Simple, outlined icons (using Lucide React).

The theme is configured in `src/app/globals.css` using HSL CSS variables for ShadCN UI components.

## Learn More

To learn more about Next.js, take a look at the following resources:

-   [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
-   [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Licenses

This project includes third-party open-source packages. See [third_party_licenses.md](./third_party_licenses.md) for details.

This project uses [sharp](https://github.com/lovell/sharp), which bundles [libvips](https://github.com/libvips/libvips) licensed under LGPL-3.0-or-later. See [third_party_licenses.md](./third_party_licenses.md) for details.

