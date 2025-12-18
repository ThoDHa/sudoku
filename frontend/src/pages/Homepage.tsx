import { getHomepageMode } from '../lib/preferences'
import Daily from './Daily'
import DifficultySelect from './DifficultySelect'

export default function Homepage() {
  const mode = getHomepageMode()
  
  if (mode === 'difficulty') {
    return <DifficultySelect />
  }
  
  return <Daily />
}
