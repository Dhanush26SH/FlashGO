export interface SeasonalConfig {
  tag: string;
  title: string;
  subtitle: string;
}

export const getActiveMerchandising = (): SeasonalConfig | null => {
  const now = new Date();
  const month = now.getMonth(); // 0-11
  const date = now.getDate();

  // 1. Check Festivals (Overrides seasons)
  // Diwali: roughly Oct-Nov (months 9, 10). A configurable mapping can be added for precise dates.
  if (month === 9 || month === 10) {
    return { tag: 'festival:diwali', title: 'Diwali favourites', subtitle: 'Popular picks for the celebration' };
  }
  
  // Christmas: Dec 15 - Dec 31
  if (month === 11 && date >= 15) {
    return { tag: 'festival:christmas', title: 'Christmas favourites', subtitle: 'Popular picks for the celebration' };
  }

  // 2. Fallback to Seasons
  // Jun-Sep: Rainy
  if (month >= 5 && month <= 8) {
    return { tag: 'season:rainy', title: 'Rainy season favourites', subtitle: 'Popular picks for the season' };
  }
  
  // Oct-Jan: Winter (months 9, 10, 11, 0)
  if (month >= 9 || month === 0) {
    return { tag: 'season:winter', title: 'Winter favourites', subtitle: 'Popular picks for the season' };
  }
  
  // Feb-May: Summer (months 1, 2, 3, 4)
  if (month >= 1 && month <= 4) {
    return { tag: 'season:summer', title: 'Summer favourites', subtitle: 'Popular picks for the season' };
  }

  return null;
};
