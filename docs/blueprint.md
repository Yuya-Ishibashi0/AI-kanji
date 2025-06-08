# **App Name**: AI幹事くん

## Core Features:

- Input and Dialogue: Users can input criteria (date, time, budget, cuisine, location) for the group's dining preferences using a conversational interface inside the LINE app.
- Review Analysis: AI analyzes user reviews for insights on restaurant suitability for groups, extracting sentiment, key aspects (food, service, ambiance), and mentions of group dining experiences.
- Recommendation Engine: AI suggests personalized restaurants and explains recommendations using analyzed reviews. It uses the group's inputted criteria as a tool.
- Restaurant Info Display: Display restaurant info, AI review analysis, and rationale behind recommendations.
- Mocked Reservation Assistance: Mocks of live seat availability, booking initiation, and reservation status notifications
- Personalized Preference Adjustment: Profile that confirms user preferences understood by AI, which users can manually adjust to personalize results.

## Style Guidelines:

- Primary color: HSL 210, 65%, 50% (RGB hex: #00223e) for a sense of trust and efficiency appropriate for planning; slightly muted to avoid being too trendy.
- Background color: HSL 210, 20%, 95% (RGB hex: #f9f4ee); this barely-tinted light background keeps the layout crisp and calm.
- Accent color: HSL 180, 55%, 40% (RGB hex: #f56924) provides an analogous, contrasting color.
- Headline font: 'M PLUS 1p' sans-serif for a tech-forward, computerized feel. Body font: 'Noto Sans JP' sans-serif for a neutral, modern reading experience.
- Use clean, modern icons that represent different cuisine types, dining preferences, and restaurant features.
- Ensure the LIFF app adapts well to different screen sizes.
- Loading animations give feedback during API calls.
- Backend (Compute Service): Google Cloud Run
- Database: Firebase Firestore