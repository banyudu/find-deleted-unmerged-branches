import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import findDeletedUnmergedBranches from '.';
(async () => {
  const argv = await yargs(hideBin(process.argv)).argv
  const dir = argv._[0] as string
  if (typeof dir !== 'string' || dir.length === 0) {
    console.error('Please specify a directory')
    process.exit(1)
  }
  const data = await findDeletedUnmergedBranches(dir)
  console.table(data, ['name', 'sha'])
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
