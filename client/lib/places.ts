import type { Place } from 'shared';
import { PLACE_ANIMALS } from 'shared';
import { ANIMAL_INFO } from './animals';

export const PLACE_NAME: Record<Place, string> = {
  house: '오두막',
  forest_road: '숲길',
  dock: '부둣가',
  river_road: '강가',
};

export function placeAnimalLabel(place: Place): string {
  return PLACE_ANIMALS[place].map(a => ANIMAL_INFO[a].short).join(' / ');
}
